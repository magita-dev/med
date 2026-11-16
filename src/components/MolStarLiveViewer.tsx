import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer } from 'molstar/lib/apps/viewer/app.js';
import 'molstar/build/viewer/theme/light.css';
import {
  Crosshair,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { MechanismTarget, MechanismTargetId } from '../types/medguard.ts';

interface LivePdbMetadata {
  title: string | null;
  method: string | null;
  resolutionAngstrom: number | null;
  releaseDate: string | null;
  polymerChains: number | null;
  ligands: string[];
}

interface LiveAlphaFoldMetadata {
  modelEntityId: string;
  latestVersion: number;
  globalPlddt: number | null;
  fractionVeryHigh: number | null;
  fractionConfident: number | null;
  fractionLow: number | null;
  fractionVeryLow: number | null;
  sequenceLength: number | null;
  organism: string | null;
  description: string | null;
  paeImageUrl: string | null;
}

interface StructureMetadataResponse {
  targetId: MechanismTargetId;
  rcsbId: string;
  afId: string;
  pdb: LivePdbMetadata | null;
  alphafold: LiveAlphaFoldMetadata | null;
  pdbFileUrl: string;
  afdbFileUrl: string;
}

interface MolStarLiveViewerProps {
  target: MechanismTarget;
  provenanceMode: 'PDB' | 'AlphaFold';
  onChangeProvenance: (mode: 'PDB' | 'AlphaFold') => void;
  onSelectTarget: (id: MechanismTargetId) => void;
  selectedResidueLabel?: string;
  residueFocusCounter?: number;
}

const TARGET_IDS: MechanismTargetId[] = ['CYP3A4', 'CYP2D6', 'HERG', 'PGP', 'AMPK', 'COX2'];

export function MolStarLiveViewer({
  target,
  provenanceMode,
  onChangeProvenance,
  onSelectTarget,
  selectedResidueLabel,
  residueFocusCounter = 0,
}: MolStarLiveViewerProps) {
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const loadSeqRef = useRef(0);

  const [viewerReady, setViewerReady] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<StructureMetadataResponse | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const rcsbId = target.structureId.match(/PDB\s+([A-Z0-9]{4})/i)?.[1]?.toUpperCase() ?? '1TQN';
  const afId = target.gene.match(/UniProt\s+([A-Z0-9]+)/i)?.[1]?.toUpperCase() ?? 'P08684';

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  // Initialize native Mol* Viewer once on mount and resize responsively
  useEffect(() => {
    const host = stageHostRef.current;
    if (!host) return;
    let cancelled = false;
    let instance: Viewer | null = null;

    const init = async () => {
      try {
        host.innerHTML = '';
        instance = await Viewer.create(host, {
          layoutIsExpanded: false,
          layoutShowControls: true,
          layoutShowRemoteState: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          layoutShowLeftPanel: true,
          collapseLeftPanel: true,
          collapseRightPanel: true,
          viewportShowReset: true,
          viewportShowScreenshotControls: true,
          viewportShowControls: true,
          viewportShowExpand: false,
          viewportShowToggleFullscreen: false,
          viewportShowSettings: true,
          viewportShowSelectionMode: true,
          viewportShowAnimation: false,
          viewportBackgroundColor: '#FCF9F4',
          pdbProvider: 'rcsb',
          emdbProvider: 'rcsb',
        });

        if (cancelled) {
          instance.dispose();
          return;
        }
        viewerRef.current = instance;
        setViewerReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Unable to initialize WebGL Mol* molecular engine.'
          );
          setLoadingStructure(false);
        }
      }
    };

    void init();

    const ro = new ResizeObserver(() => {
      viewerRef.current?.handleResize();
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      setViewerReady(false);
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      } else if (instance) {
        instance.dispose();
      }
    };
  }, []);

  // Reflow Mol* viewport whenever fullscreen state toggles
  useEffect(() => {
    const timer = window.setTimeout(() => {
      viewerRef.current?.handleResize();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  // Fetch live metadata from /api/structure/metadata/:targetId
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/structure/metadata/${encodeURIComponent(target.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StructureMetadataResponse | null) => {
        if (!cancelled && data) {
          setMetadata(data);
        }
      })
      .catch(() => {
        // Non-fatal: viewer can still load directly via /api/structure/file
      });
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  // Load live PDB or AlphaFold structure whenever target or provenanceMode changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer) return;

    const currentSeq = ++loadSeqRef.current;
    let cancelled = false;
    let blobUrl: string | null = null;

    const loadLiveStructure = async () => {
      setLoadingStructure(true);
      setLoadError(null);

      try {
        await viewer.plugin.clear();
        if (cancelled || currentSeq !== loadSeqRef.current) return;

        const fileUrl =
          provenanceMode === 'PDB'
            ? `/api/structure/file?source=pdb&id=${encodeURIComponent(rcsbId)}`
            : `/api/structure/file?source=afdb&id=${encodeURIComponent(afId)}`;

        const resp = await fetch(fileUrl);
        if (!resp.ok) {
          throw new Error(`Structure server returned HTTP ${resp.status}`);
        }

        const isBinary = resp.headers.get('x-structure-binary') === 'true';
        const payload = isBinary ? await resp.arrayBuffer() : await resp.text();
        if (cancelled || currentSeq !== loadSeqRef.current) return;

        blobUrl = URL.createObjectURL(
          new Blob([payload], {
            type: isBinary ? 'application/octet-stream' : 'text/plain;charset=utf-8',
          })
        );

        const label =
          provenanceMode === 'PDB'
            ? `PDB ${rcsbId} — ${target.name}`
            : `AlphaFold AF-${afId}-F1 — ${target.name}`;

        await viewer.loadStructureFromUrl(blobUrl, 'mmcif', isBinary, { label });

        if (!cancelled && currentSeq === loadSeqRef.current) {
          viewer.handleResize();
          setLoadingStructure(false);
        }
      } catch (err) {
        if (!cancelled && currentSeq === loadSeqRef.current) {
          setLoadError(
            err instanceof Error
              ? err.message
              : `Unable to load ${provenanceMode} structure (${provenanceMode === 'PDB' ? rcsbId : afId}).`
          );
          setLoadingStructure(false);
        }
      } finally {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      }
    };

    void loadLiveStructure();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, target.id, target.name, provenanceMode, rcsbId, afId, reloadTick]);

  // Focus & select residue or Heme ligand in live Mol* when user clicks a residue
  const focusResidueInMolstar = useCallback((label: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (/heme/i.test(label)) {
      viewer.structureInteractivity({
        expression: (Q) =>
          Q.struct.generator.atomGroups({
            'residue-test': Q.core.rel.eq([
              Q.struct.atomProperty.macromolecular.label_comp_id(),
              'HEM',
            ]),
          }),
        action: ['select', 'focus'],
      });
      return;
    }

    const match = label.match(/(\d+)/);
    if (!match) return;
    const seqNum = Number(match[1]);
    if (!Number.isFinite(seqNum)) return;

    viewer.structureInteractivity({
      expression: (Q) =>
        Q.struct.generator.atomGroups({
          'residue-test': Q.core.logic.or([
            Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_seq_id(), seqNum]),
            Q.core.rel.eq([Q.struct.atomProperty.macromolecular.label_seq_id(), seqNum]),
          ]),
        }),
      action: ['select', 'focus'],
    });
  }, []);

  useEffect(() => {
    if (!viewerReady || loadingStructure || !selectedResidueLabel || residueFocusCounter === 0) {
      return;
    }
    focusResidueInMolstar(selectedResidueLabel);
  }, [viewerReady, loadingStructure, selectedResidueLabel, residueFocusCounter, focusResidueInMolstar]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.structureInteractivity({ action: 'select' });
    viewer.plugin.canvas3d?.requestCameraReset();
  };

  const pdbMeta = metadata?.targetId === target.id ? metadata.pdb : null;
  const afMeta = metadata?.targetId === target.id ? metadata.alphafold : null;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-3 z-50 flex flex-col rounded-xl border border-[#B8A68B] bg-[#FCF9F4] shadow-2xl overflow-hidden'
          : 'flex flex-col bg-[#FCF9F4]'
      }
    >
      {/* Top Control & Live Provenance Toolbar */}
      <div className="px-4 py-2.5 bg-[#F5EFE5] border-b border-[#D5C8B4] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#EFE7DA] border border-[#D5C8B4] p-0.5">
            <button
              type="button"
              onClick={() => onChangeProvenance('PDB')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                provenanceMode === 'PDB'
                  ? 'bg-[#29659B] text-[#FCF9F4] font-semibold'
                  : 'text-[#4F544C] hover:text-[#1E221D]'
              }`}
            >
              Experimental PDB {rcsbId}
            </button>
            <button
              type="button"
              onClick={() => onChangeProvenance('AlphaFold')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                provenanceMode === 'AlphaFold'
                  ? 'bg-[#8E3E1C] text-[#FCF9F4] font-semibold'
                  : 'text-[#4F544C] hover:text-[#1E221D]'
              }`}
            >
              AlphaFold DB {afId}
            </button>
          </div>

          {isFullscreen && (
            <div className="flex flex-wrap items-center gap-1">
              {TARGET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTarget(id)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border whitespace-nowrap shrink-0 ${
                    id === target.id
                      ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D] font-semibold'
                      : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {selectedResidueLabel && (
            <button
              type="button"
              onClick={() => focusResidueInMolstar(selectedResidueLabel)}
              disabled={loadingStructure}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#B49ED1] bg-[#F2ECF8] text-[#4E3470] text-xs font-mono font-medium hover:bg-[#E7DDF3] disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Zoom and select active catalytic residue in Mol*"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Focus {selectedResidueLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleResetCamera}
            disabled={loadingStructure}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#D5C8B4] bg-[#FCF9F4] text-[#3C4138] text-xs font-mono hover:border-[#B8A68B] disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Reset Mol* camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset View
          </button>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#D5C8B4] bg-[#FCF9F4] text-[#3C4138] text-xs font-mono hover:border-[#B8A68B] whitespace-nowrap shrink-0"
            title="Reload structure from live DB"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStructure ? 'animate-spin' : ''}`} />
            Reload
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#29659B] bg-[#E9F1F9] text-[#1A4B7A] text-xs font-mono font-semibold hover:bg-[#DCE9F5] whitespace-nowrap shrink-0"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                Exit Full View
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                Expand Full View
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live DB Metadata Ribbon */}
      <div className="px-4 py-2 bg-[#FCF9F4] border-b border-[#E5DAC8] flex flex-wrap items-center justify-between gap-2 text-xs">
        {provenanceMode === 'PDB' ? (
          <div className="flex flex-wrap items-center gap-2 text-[#3C4138]">
            <span className="font-mono font-semibold text-[#1A4B7A]">
              RCSB PDB {rcsbId}
            </span>
            <span aria-hidden="true" className="text-[#A8987E]">·</span>
            <span className="truncate max-w-xl">
              {pdbMeta?.title || target.name}
            </span>
            {pdbMeta?.method && (
              <>
                <span aria-hidden="true" className="text-[#A8987E]">·</span>
                <span className="font-mono tabular-nums text-[#555A50]">
                  {pdbMeta.method}
                  {pdbMeta.resolutionAngstrom ? ` (${pdbMeta.resolutionAngstrom.toFixed(2)} Å)` : ''}
                </span>
              </>
            )}
            {pdbMeta?.ligands && pdbMeta.ligands.length > 0 && (
              <>
                <span aria-hidden="true" className="text-[#A8987E]">·</span>
                <span className="font-mono text-[#555A50]">
                  Ligands: {pdbMeta.ligands.slice(0, 5).join(', ')}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[#3C4138]">
            <span className="font-mono font-semibold text-[#8E3E1C]">
              {afMeta?.modelEntityId || `AF-${afId}-F1`}
              {afMeta?.latestVersion ? ` (v${afMeta.latestVersion})` : ''}
            </span>
            <span aria-hidden="true" className="text-[#A8987E]">·</span>
            <span className="font-mono tabular-nums text-[#555A50]">
              Mean pLDDT {(afMeta?.globalPlddt ?? target.plddtScore ?? 90).toFixed(1)}
            </span>
            {afMeta?.sequenceLength && (
              <>
                <span aria-hidden="true" className="text-[#A8987E]">·</span>
                <span className="font-mono tabular-nums text-[#555A50]">
                  {afMeta.sequenceLength} residues
                </span>
              </>
            )}
            {afMeta?.organism && (
              <>
                <span aria-hidden="true" className="text-[#A8987E]">·</span>
                <span className="italic text-[#555A50]">{afMeta.organism}</span>
              </>
            )}
          </div>
        )}

        {provenanceMode === 'AlphaFold' ? (
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono text-[#4F544C]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#0053D6] inline-block" />
              Very high (&gt;90)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#65CBF3] inline-block" />
              Confident (70–90)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#FFDB13] inline-block" />
              Low (50–70)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#FF7D45] inline-block" />
              Very low (&lt;50)
            </span>
          </div>
        ) : (
          <span className="text-[11px] font-mono text-[#555A50]">
            Drag to rotate · Scroll to zoom · Click top sequence or left/right panel toggles for full Mol* tools
          </span>
        )}
      </div>

      {/* Dedicated Mol* Canvas Host (position: relative so .msp-plugin inset:0 fills 100% cleanly) */}
      <div
        className={`relative w-full bg-[#FCF9F4] ${
          isFullscreen ? 'flex-1 min-h-0' : 'h-[600px] lg:h-[660px]'
        }`}
      >
        <div ref={stageHostRef} className="relative w-full h-full overflow-hidden" />

        {loadingStructure && !loadError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#FCF9F4]/85 text-center p-6 pointer-events-none">
            <Loader2 className="w-7 h-7 text-[#29659B] animate-spin mb-2" />
            <div className="text-sm font-semibold text-[#1E221D]">
              Loading {provenanceMode === 'PDB' ? `PDB ${rcsbId}` : `AlphaFold ${afId}`} into Mol* Live DB…
            </div>
            <p className="text-xs text-[#555A50] mt-1 font-mono">
              Streaming atomic coordinates &amp; building 3D molecular representation
            </p>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#FCF9F4]/95 text-center p-6 space-y-3">
            <div className="text-sm font-semibold text-[#8B152A]">
              Unable to load live 3D structure ({provenanceMode === 'PDB' ? rcsbId : afId})
            </div>
            <p className="text-xs text-[#4F544C] max-w-md">{loadError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className="px-3.5 py-1.5 rounded-lg bg-[#29659B] text-[#FCF9F4] text-xs font-semibold hover:bg-[#1F507D]"
              >
                Retry Live Load
              </button>
              <a
                href={
                  provenanceMode === 'PDB'
                    ? `https://molstar.org/viewer/?pdb=${encodeURIComponent(rcsbId)}`
                    : `https://molstar.org/viewer/?afdb=${encodeURIComponent(afId)}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg border border-[#D5C8B4] bg-[#F5EFE5] text-xs font-medium text-[#1E221D] hover:border-[#B8A68B]"
              >
                Open Standalone Mol* <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
