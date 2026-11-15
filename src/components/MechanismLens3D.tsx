import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ExternalLink, Info, RotateCcw, ShieldAlert } from 'lucide-react';
import { MECHANISM_TARGETS } from '../data/medguardCatalog.ts';
import type { LanguageCode, MechanismTargetId } from '../types/medguard.ts';

interface MechanismLens3DProps {
  targetId: MechanismTargetId;
  onSelectTarget: (id: MechanismTargetId) => void;
  language: LanguageCode;
}

const TARGET_IDS: MechanismTargetId[] = ['CYP3A4', 'CYP2D6', 'HERG', 'PGP', 'AMPK', 'COX2'];

export function MechanismLens3D({
  targetId,
  onSelectTarget,
  language,
}: MechanismLens3DProps) {
  const target = MECHANISM_TARGETS[targetId];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [provenanceMode, setProvenanceMode] = useState<'PDB' | 'AlphaFold'>(
    target.provenance === 'AlphaFold-predicted' ? 'AlphaFold' : 'PDB'
  );
  const [ligandMode, setLigandMode] = useState<'clash' | 'substrate'>('clash');
  const [selectedResidueId, setSelectedResidueId] = useState<string>(target.residues[0]?.id ?? 'r1');
  const [viewerMode, setViewerMode] = useState<'threejs' | 'molstar'>('threejs');
  const [molstarLoaded, setMolstarLoaded] = useState(false);

  const ligandModeRef = useRef(ligandMode);
  const provenanceRef = useRef(provenanceMode);
  const resetViewRef = useRef<() => void>(() => {});

  useEffect(() => {
    setProvenanceMode(target.provenance === 'AlphaFold-predicted' ? 'AlphaFold' : 'PDB');
    setSelectedResidueId(target.residues[0]?.id ?? 'r1');
    setMolstarLoaded(false);
  }, [target]);

  useEffect(() => {
    ligandModeRef.current = ligandMode;
  }, [ligandMode]);

  useEffect(() => {
    provenanceRef.current = provenanceMode;
  }, [provenanceMode]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EFE7DA');
    scene.fog = new THREE.FogExp2('#EFE7DA', 0.042);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(0.4, 2.2, 6.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xfffdf8, 0xd5c8b4, 1.1));
    const keyLight = new THREE.DirectionalLight(0xfff8eb, 1.65);
    keyLight.position.set(5, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xb8c99a, 0.95);
    rimLight.position.set(-5, -3, -4);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 11;

    const proteinGroup = new THREE.Group();
    scene.add(proteinGroup);

    const disposables: Array<{ dispose: () => void }> = [];
    const register = <T extends { dispose: () => void }>(d: T): T => {
      disposables.push(d);
      return d;
    };

    // Organelle membrane disc beneath catalytic pocket
    const membraneDiscGeo = register(new THREE.RingGeometry(1.4, 3.6, 48));
    const membraneDiscMat = register(
      new THREE.MeshBasicMaterial({
        color: target.membraneType === 'PLASMA_PORE' ? 0x637928 : 0x29659b,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      })
    );
    const membraneDisc = new THREE.Mesh(membraneDiscGeo, membraneDiscMat);
    membraneDisc.rotation.x = Math.PI / 2;
    membraneDisc.position.y = -1.25;
    proteinGroup.add(membraneDisc);

    // Alpha-Helix Ribbon Backbone styled cleanly against parchment
    const accentColor = new THREE.Color(target.accentHex);
    const helixMaterials: THREE.MeshStandardMaterial[] = [];

    for (let h = 0; h < 6; h++) {
      const pts: THREE.Vector3[] = [];
      const baseAngle = (h / 6) * Math.PI * 2;
      const plddtColor =
        h % 3 === 0 ? 0x29659b : h % 3 === 1 ? 0x637928 : 0xc99a2e;

      const mat = register(
        new THREE.MeshStandardMaterial({
          color: provenanceMode === 'AlphaFold' ? plddtColor : accentColor,
          emissive: accentColor.clone().multiplyScalar(0.1),
          roughness: 0.36,
          metalness: 0.12,
        })
      );
      helixMaterials.push(mat);

      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const theta = t * Math.PI * 3.5 + baseAngle;
        const radial = 1.35 + Math.sin(t * Math.PI) * 0.45 + Math.cos(theta) * 0.18;
        pts.push(
          new THREE.Vector3(
            Math.cos(baseAngle + t * 0.5) * radial + Math.cos(theta) * 0.14,
            (t - 0.5) * 2.9,
            Math.sin(baseAngle + t * 0.5) * radial + Math.sin(theta) * 0.14
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = register(new THREE.TubeGeometry(curve, 64, 0.11, 12, false));
      proteinGroup.add(new THREE.Mesh(tubeGeo, mat));
    }

    // Catalytic Core
    const hemeGeo = register(new THREE.TorusGeometry(0.55, 0.06, 12, 32));
    const hemeMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xba5d33,
        emissive: 0x6b2f13,
        emissiveIntensity: 0.25,
        roughness: 0.3,
        metalness: 0.25,
      })
    );
    const hemeRing = new THREE.Mesh(hemeGeo, hemeMat);
    hemeRing.rotation.x = Math.PI / 2.4;
    proteinGroup.add(hemeRing);

    const feGeo = register(new THREE.SphereGeometry(0.16, 20, 20));
    const feMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xc99a2e,
        emissive: 0x6b4e11,
        emissiveIntensity: 0.25,
        roughness: 0.22,
        metalness: 0.55,
      })
    );
    proteinGroup.add(new THREE.Mesh(feGeo, feMat));

    // Clickable Pocket Residues (Nucleus purple tones)
    const clickableResidues: THREE.Object3D[] = [];
    const resGeo = register(new THREE.SphereGeometry(0.17, 18, 18));
    target.residues.forEach((res) => {
      const resMat = register(
        new THREE.MeshStandardMaterial({
          color: 0x8b6bb1,
          emissive: 0x3b2857,
          emissiveIntensity: 0.2,
          roughness: 0.32,
          metalness: 0.15,
        })
      );
      const mesh = new THREE.Mesh(resGeo, resMat);
      mesh.position.set(...res.position);
      mesh.userData.residueId = res.id;
      clickableResidues.push(mesh);
      proteinGroup.add(mesh);
    });

    // Substrate Ligand (Leaf Green) & Inhibitor Clash Ligand (Crimson/Terracotta)
    const substrateGroup = new THREE.Group();
    const subGeo = register(new THREE.IcosahedronGeometry(0.28, 1));
    const subMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x3e7a3a,
        emissive: 0x1e441c,
        emissiveIntensity: 0.2,
        roughness: 0.3,
        metalness: 0.2,
      })
    );
    substrateGroup.add(new THREE.Mesh(subGeo, subMat));
    proteinGroup.add(substrateGroup);

    const inhibitorGroup = new THREE.Group();
    const inhGeo = register(new THREE.OctahedronGeometry(0.36, 1));
    const inhMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xb4233c,
        emissive: 0x61101f,
        emissiveIntensity: 0.25,
        roughness: 0.28,
        metalness: 0.2,
      })
    );
    inhibitorGroup.add(new THREE.Mesh(inhGeo, inhMat));
    proteinGroup.add(inhibitorGroup);

    resetViewRef.current = () => {
      camera.position.set(0.4, 2.2, 6.2);
      controls.target.set(0, 0, 0);
      controls.update();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerUp = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableResidues, false);
      if (hits.length > 0) {
        const rid = hits[0].object.userData.residueId as string | undefined;
        if (rid) setSelectedResidueId(rid);
      }
    };
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      proteinGroup.rotation.y += dt * 0.24;

      const isClash = ligandModeRef.current === 'clash';
      inhibitorGroup.visible = isClash;
      if (isClash) {
        inhibitorGroup.position.set(0.1, 0.35 + Math.sin(t * 2.4) * 0.06, 0.15);
        substrateGroup.position.set(1.45, 0.95 + Math.cos(t * 1.8) * 0.08, 0.85);
      } else {
        substrateGroup.position.set(0, 0.32 + Math.sin(t * 2) * 0.05, 0);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (!isSoftwareGl) renderer.compile(scene, camera);
    tick();

    const ro = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 360);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [target, provenanceMode]);

  const activeResidue =
    target.residues.find((r) => r.id === selectedResidueId) ?? target.residues[0];

  const rcsbId = target.structureId.match(/PDB\s+([A-Z0-9]{4})/i)?.[1] ?? '1TQN';
  const afId = target.gene.match(/UniProt\s+([A-Z0-9]+)/i)?.[1] ?? 'P08684';

  return (
    <div className="organelle-panel rounded-xl overflow-hidden">
      {/* Header & Target Selector */}
      <div className="px-5 py-4 border-b border-[#D5C8B4] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#875E0D]">
            <span>PREDICTED EVIDENCE TIER</span>
            <span aria-hidden="true">·</span>
            <span>{provenanceMode === 'PDB' ? 'Experimental (PDB)' : 'AlphaFold-predicted'}</span>
            <span aria-hidden="true">·</span>
            <span>{target.structureId}</span>
          </div>
          <h3 className="font-display text-lg font-semibold text-[#1E221D] mt-0.5">{target.name}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#EFE7DA] border border-[#D5C8B4] p-0.5 mr-1">
            <button
              type="button"
              onClick={() => setViewerMode('threejs')}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors whitespace-nowrap ${
                viewerMode === 'threejs'
                  ? 'bg-[#556B22] text-[#FCF9F4] font-semibold'
                  : 'text-[#4F544C] hover:text-[#1E221D]'
              }`}
            >
              3D Pocket Stage
            </button>
            <button
              type="button"
              onClick={() => setViewerMode('molstar')}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors whitespace-nowrap ${
                viewerMode === 'molstar'
                  ? 'bg-[#29659B] text-[#FCF9F4] font-semibold'
                  : 'text-[#4F544C] hover:text-[#1E221D]'
              }`}
            >
              Mol* Live DB
            </button>
          </div>
          {TARGET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTarget(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border whitespace-nowrap ${
                id === targetId
                  ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D] font-semibold'
                  : 'bg-[#F5EFE5] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Provenance & Guardrail Banner */}
      <div className="px-5 py-2.5 bg-[#FDF5E3] border-b border-[#E4C98C] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B4A08]">
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-[#B8841E] shrink-0" />
          <strong>Explanation Only:</strong> Structure-based AlphaFold/PDB views explain verified clinical rules; they never create alerts on their own.
        </span>
        <span className="font-mono text-[#875E0D]">
          {target.resolutionOrConfidence}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(310px,1fr)]">
        {/* 3D Protein Pocket Stage / Click-to-Load Mol* Viewer */}
        <div className="relative bg-[#EFE7DA] min-h-[380px] lg:min-h-[450px]">
          <div
            ref={mountRef}
            className={`${
              viewerMode === 'threejs' ? 'block' : 'hidden'
            } w-full h-[380px] lg:h-[450px] cursor-grab active:cursor-grabbing`}
          />

          {viewerMode === 'molstar' && (
            <div className="w-full h-[380px] lg:h-[450px] flex flex-col bg-[#F5EFE5]">
              {!molstarLoaded ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[11px] font-mono text-[#1E221D]">
                    {provenanceMode === 'PDB'
                      ? `Experimental PDB ${rcsbId}`
                      : `AlphaFold DB ${afId} (pLDDT ${target.plddtScore ?? 'high'})`}
                  </div>
                  <h4 className="font-display text-lg font-semibold text-[#1E221D]">
                    Interactive Mol* 3D Viewer ({target.id})
                  </h4>
                  <p className="text-xs text-[#4F544C] max-w-md leading-relaxed">
                    {provenanceMode === 'PDB'
                      ? 'Experimental PDB structures capture crystal or cryo-EM coordinates under laboratory conditions. Click below to load the hosted Mol* viewer.'
                      : 'AlphaFold DB models are computational predictions with per-residue pLDDT confidence. Treat low-confidence loops as unverified.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProvenanceMode('PDB');
                        setMolstarLoaded(true);
                      }}
                      className="px-3.5 py-2 rounded-lg bg-[#29659B] hover:bg-[#1F507D] text-[#FCF9F4] text-xs font-semibold transition-colors"
                    >
                      Load PDB {rcsbId} in Mol*
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProvenanceMode('AlphaFold');
                        setMolstarLoaded(true);
                      }}
                      className="px-3.5 py-2 rounded-lg bg-[#8E3E1C] hover:bg-[#733115] text-[#FCF9F4] text-xs font-semibold transition-colors"
                    >
                      Load AlphaFold {afId} in Mol*
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  title={`${target.name} ${provenanceMode} 3D structure`}
                  src={
                    provenanceMode === 'PDB'
                      ? `https://molstar.org/viewer/?pdb=${encodeURIComponent(rcsbId)}`
                      : `https://molstar.org/viewer/?afdb=${encodeURIComponent(afId)}`
                  }
                  className="w-full flex-1 border-0"
                />
              )}
              <div className="px-3 py-2 bg-[#FCF9F4] border-t border-[#D5C8B4] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#4F544C]">
                <span>
                  {provenanceMode === 'PDB'
                    ? `Hosted Mol* · Experimental PDB ${rcsbId}`
                    : `Hosted Mol* · AlphaFold-predicted ${afId}`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProvenanceMode('PDB');
                      setMolstarLoaded(true);
                    }}
                    className={`px-2 py-0.5 rounded border ${
                      provenanceMode === 'PDB'
                        ? 'bg-[#E9F1F9] border-[#B3CDE5] text-[#1A4B7A] font-semibold'
                        : 'border-[#D5C8B4]'
                    }`}
                  >
                    PDB {rcsbId}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProvenanceMode('AlphaFold');
                      setMolstarLoaded(true);
                    }}
                    className={`px-2 py-0.5 rounded border ${
                      provenanceMode === 'AlphaFold'
                        ? 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D] font-semibold'
                        : 'border-[#D5C8B4]'
                    }`}
                  >
                    AlphaFold {afId}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Dock inside Three.js 3D Viewport */}
          {viewerMode === 'threejs' && (
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-[#FCF9F4]/95 border border-[#D5C8B4] rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLigandMode('clash')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    ligandMode === 'clash'
                      ? 'bg-[#FCEBEF] text-[#8B152A] border border-[#E2A9B3] font-semibold'
                      : 'text-[#4F544C] hover:bg-[#EFE7DA]'
                  }`}
                >
                  Inhibitor Clash ({target.inhibitorLabel})
                </button>
                <button
                  type="button"
                  onClick={() => setLigandMode('substrate')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    ligandMode === 'substrate'
                      ? 'bg-[#EAF5E9] text-[#245920] border border-[#B4D9B1] font-semibold'
                      : 'text-[#4F544C] hover:bg-[#EFE7DA]'
                  }`}
                >
                  Normal Substrate ({target.substrateLabel})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setProvenanceMode('PDB')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md whitespace-nowrap ${
                    provenanceMode === 'PDB'
                      ? 'bg-[#E9F1F9] text-[#1A4B7A] border border-[#B3CDE5] font-semibold'
                      : 'text-[#555A50] hover:text-[#1E221D]'
                  }`}
                >
                  PDB
                </button>
                <button
                  type="button"
                  onClick={() => setProvenanceMode('AlphaFold')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md whitespace-nowrap ${
                    provenanceMode === 'AlphaFold'
                      ? 'bg-[#FDF5E3] text-[#875E0D] border border-[#E4C98C] font-semibold'
                      : 'text-[#555A50] hover:text-[#1E221D]'
                  }`}
                >
                  AlphaFold pLDDT
                </button>
                <button
                  type="button"
                  onClick={() => resetViewRef.current()}
                  className="p-1.5 text-[#4F544C] hover:text-[#1E221D] rounded-md hover:bg-[#EFE7DA]"
                  title="Reset 3D camera"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mechanism & Residue Audit Side Panel */}
        <div className="p-5 border-t lg:border-t-0 lg:border-l border-[#D5C8B4] bg-[#FCF9F4] space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#29659B] font-semibold">CELLULAR LOCATION</div>
            <p className="text-sm font-semibold text-[#1E221D]">{target.cellularOrganelle}</p>
            <p className="text-xs text-[#4F544C] leading-relaxed">{target.compartmentSummary}</p>
          </div>

          <div className="organelle-subpanel rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#8E3E1C] font-semibold">POCKET INTERACTION</span>
              <span className="text-[#555A50]">{target.clashDistanceAngstrom}</span>
            </div>
            <p className="text-sm text-[#1E221D] leading-relaxed">
              {language === 'ta'
                ? `${target.explanationSummary} (${target.clinicalImplication})`
                : `${target.explanationSummary} ${target.clinicalImplication}`}
            </p>
          </div>

          {/* Clickable Residues */}
          <div className="space-y-2">
            <div className="text-xs font-mono text-[#555A50]">CATALYTIC POCKET RESIDUES (CLICK TO INSPECT)</div>
            <div className="flex flex-wrap gap-1.5">
              {target.residues.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedResidueId(r.id)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
                    r.id === activeResidue?.id
                      ? 'bg-[#F2ECF8] border-[#B49ED1] text-[#4E3470] font-semibold'
                      : 'bg-[#F5EFE5] border-[#D5C8B4] text-[#3C4138] hover:border-[#B8A68B]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {activeResidue && (
              <div className="text-xs text-[#3C4138] bg-[#EFE7DA] border border-[#D5C8B4] rounded-lg p-2.5 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-[#74559C] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#1E221D] font-mono">{activeResidue.label}:</strong>{' '}
                  {activeResidue.role}
                </span>
              </div>
            )}
          </div>

          {/* External Primary Structure & FDA Label Links */}
          <div className="pt-3 border-t border-[#D5C8B4] flex flex-wrap items-center gap-3 text-xs">
            <a
              href={target.rcsbStructureUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#29659B] hover:underline font-medium"
            >
              RCSB PDB {rcsbId} <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={target.alphafoldViewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#8E3E1C] hover:underline font-medium"
            >
              Mol* AlphaFold DB {afId} <ExternalLink className="w-3 h-3" />
            </a>
            {target.dailymedUrl && (
              <a
                href={target.dailymedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#556B22] hover:underline font-medium"
              >
                FDA DailyMed Label <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
