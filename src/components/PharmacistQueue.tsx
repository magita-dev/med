import { useEffect, useState } from 'react';
import {
  Check,
  Database,
  ExternalLink,
  Lock,
  Microscope,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  ClinicalRulesGovernanceReport,
  MechanismTargetId,
  MolecularEvidenceEntry,
  PharmacistHypothesis,
} from '../types/medguard.ts';

interface PharmacistQueueProps {
  onInspectMechanism: (targetId: MechanismTargetId) => void;
}

type QueueTab = 'hypotheses' | 'evidence' | 'governance';

const TARGET_OPTIONS: MechanismTargetId[] = ['CYP3A4', 'CYP2D6', 'HERG', 'PGP', 'AMPK', 'COX2'];

export function PharmacistQueue({ onInspectMechanism }: PharmacistQueueProps) {
  const [activeTab, setActiveTab] = useState<QueueTab>('hypotheses');
  const [hypotheses, setHypotheses] = useState<PharmacistHypothesis[]>([]);
  const [evidence, setEvidence] = useState<MolecularEvidenceEntry[]>([]);
  const [governance, setGovernance] = useState<ClinicalRulesGovernanceReport | null>(null);

  // Proposal form state
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [propTitle, setPropTitle] = useState('');
  const [propDrugs, setPropDrugs] = useState('');
  const [propTarget, setPropTarget] = useState<MechanismTargetId>('CYP3A4');
  const [propProvenance, setPropProvenance] = useState<'AlphaFold-predicted' | 'Experimental (PDB)'>(
    'AlphaFold-predicted'
  );
  const [propPlddt, setPropPlddt] = useState('90.2');
  const [propDist, setPropDist] = useState('2.8');
  const [propRationale, setPropRationale] = useState('');
  const [propSource, setPropSource] = useState('');
  const [propError, setPropError] = useState('');

  // Curated molecular evidence form state
  const [evTarget, setEvTarget] = useState<MechanismTargetId>('CYP3A4');
  const [evDrug, setEvDrug] = useState('');
  const [evRel, setEvRel] = useState<MolecularEvidenceEntry['relationship']>('inhibition');
  const [evKind, setEvKind] = useState<'experimental' | 'predicted'>('experimental');
  const [evAccession, setEvAccession] = useState('');
  const [evLocator, setEvLocator] = useState('');
  const [evLimitation, setEvLimitation] = useState('');
  const [evError, setEvError] = useState('');

  useEffect(() => {
    fetch('/api/pharmacist/hypotheses')
      .then((r) => r.json())
      .then((d) => setHypotheses(d.hypotheses ?? []))
      .catch(() => {});
    fetch('/api/pharmacist/evidence')
      .then((r) => r.json())
      .then((d) => setEvidence(d.evidence ?? []))
      .catch(() => {});
    fetch('/api/clinical/rules')
      .then((r) => r.json())
      .then((d) => setGovernance(d))
      .catch(() => {});
  }, []);

  const review = async (id: string, action: 'escalate' | 'dismiss') => {
    const res = await fetch(`/api/pharmacist/hypotheses/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setHypotheses(data.hypotheses ?? []);
  };

  const proposeHypothesis = async (e: React.FormEvent) => {
    e.preventDefault();
    setPropError('');
    if (!propTitle.trim() || !propRationale.trim()) {
      setPropError('Hypothesis title and structural rationale are required.');
      return;
    }
    const res = await fetch('/api/pharmacist/hypotheses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: propTitle.trim(),
        drugsInvolved: propDrugs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetProteinId: propTarget,
        provenance: propProvenance,
        plddtConfidence: Number(propPlddt) || 89,
        pocketDistanceAngstrom: Number(propDist) || 3.0,
        structuralRationale: propRationale.trim(),
        evidenceSource: propSource.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPropError(data.error || 'Failed to queue hypothesis.');
      return;
    }
    setHypotheses(data.hypotheses ?? []);
    setPropTitle('');
    setPropDrugs('');
    setPropRationale('');
    setPropSource('');
    setShowProposalForm(false);
  };

  const addMolecularEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvError('');
    if (!evDrug.trim() || !evAccession.trim() || !evLocator.trim()) {
      setEvError('Drug, accession, and locator are required.');
      return;
    }
    const res = await fetch('/api/pharmacist/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: evTarget,
        drug: evDrug.trim(),
        relationship: evRel,
        structureKind: evKind,
        accession: evAccession.trim(),
        locator: evLocator.trim(),
        limitation: evLimitation.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEvError(data.error || 'Failed to add molecular evidence.');
      return;
    }
    setEvidence(data.evidence ?? []);
    setEvDrug('');
    setEvAccession('');
    setEvLocator('');
    setEvLimitation('');
  };

  return (
    <div className="space-y-5">
      <div className="organelle-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#8E3E1C]">
              <Lock className="w-3.5 h-3.5" />
              <span>PHARMACIST-ONLY GOVERNANCE QUEUE · NEVER EXPOSED TO PATIENTS</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-[#1E221D]">
              Molecular Governance, Hypotheses & Clinical Rule Audit
            </h2>
            <p className="text-xs text-[#555A50] leading-relaxed">
              In MedGuard, predicted 3D structural clashes can explain verified/curated alerts, never create patient-facing warnings on their own. Unverified structural hypotheses and rule provenance audits live here.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E4D9C7]">
          <button
            type="button"
            onClick={() => setActiveTab('hypotheses')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'hypotheses'
                ? 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <Microscope className="w-3.5 h-3.5" />
            Hypothesis Queue ({hypotheses.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('evidence')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'evidence'
                ? 'bg-[#E9F1F9] border-[#29659B] text-[#1A4B7A]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Molecular Evidence Catalog ({evidence.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('governance')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'governance'
                ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#3E7A3A]" />
            Clinical Rule Governance ({governance?.total ?? 0})
          </button>
        </div>
      </div>

      {activeTab === 'hypotheses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-mono text-[#555A50]">
              All queued hypotheses carry patientVisible: false until escalated and backed by regulatory/clinical labeling.
            </span>
            <button
              type="button"
              onClick={() => setShowProposalForm((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#8E3E1C] hover:bg-[#733115] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {showProposalForm ? 'Close Proposal Form' : 'Propose Structural Hypothesis'}
            </button>
          </div>

          {showProposalForm && (
            <form onSubmit={proposeHypothesis} className="organelle-panel rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#1E221D]">
                Queue New Pharmacist-Only Structural Hypothesis (Predicted Tier)
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  required
                  value={propTitle}
                  onChange={(e) => setPropTitle(e.target.value)}
                  placeholder="Hypothesis title (e.g., Predicted CYP3A4 overlap)"
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
                />
                <input
                  value={propDrugs}
                  onChange={(e) => setPropDrugs(e.target.value)}
                  placeholder="Drugs involved (comma separated)"
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs font-mono text-[#1E221D]"
                />
              </div>
              <div className="grid sm:grid-cols-4 gap-3">
                <select
                  value={propTarget}
                  onChange={(e) => setPropTarget(e.target.value as MechanismTargetId)}
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs font-mono text-[#1E221D]"
                >
                  {TARGET_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      Target: {t}
                    </option>
                  ))}
                </select>
                <select
                  value={propProvenance}
                  onChange={(e) =>
                    setPropProvenance(
                      e.target.value as 'AlphaFold-predicted' | 'Experimental (PDB)'
                    )
                  }
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
                >
                  <option value="AlphaFold-predicted">AlphaFold-predicted</option>
                  <option value="Experimental (PDB)">Experimental (PDB)</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  value={propPlddt}
                  onChange={(e) => setPropPlddt(e.target.value)}
                  placeholder="pLDDT confidence"
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs font-mono text-[#1E221D]"
                />
                <input
                  type="number"
                  step="0.1"
                  value={propDist}
                  onChange={(e) => setPropDist(e.target.value)}
                  placeholder="Pocket gap (Å)"
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs font-mono text-[#1E221D]"
                />
              </div>
              <textarea
                rows={2}
                required
                value={propRationale}
                onChange={(e) => setPropRationale(e.target.value)}
                placeholder="Structural rationale & limitation (never auto-shown to patients)"
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
              />
              <input
                value={propSource}
                onChange={(e) => setPropSource(e.target.value)}
                placeholder="Supporting source URL (optional)"
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs font-mono text-[#1E221D]"
              />
              {propError && (
                <div className="text-xs text-[#8B152A] bg-[#FCEBEF] border border-[#E2A9B3] rounded-lg px-3 py-2">
                  {propError}
                </div>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Submit to Pharmacist Queue
              </button>
            </form>
          )}

          <div className="grid gap-4">
            {hypotheses.map((h) => (
              <div key={h.id} className="organelle-panel rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-[#875E0D] font-semibold">{h.evidenceTier} Tier</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#29659B]">{h.provenance}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#4F544C]">pLDDT {h.plddtConfidence}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#4F544C]">Pocket gap {h.pocketDistanceAngstrom} Å</span>
                    </div>
                    <h3 className="text-base font-semibold text-[#1E221D]">{h.title}</h3>
                    <div className="text-xs font-mono text-[#555A50]">
                      Drugs: {h.drugsInvolved.join(' + ')} · Target: {h.targetProteinId}
                      {h.evidenceLocator ? ` · ${h.evidenceLocator}` : ''}
                    </div>
                  </div>

                  <span
                    className={`text-xs font-mono px-2.5 py-1 rounded border font-medium ${
                      h.status === 'Pending Pharmacist Review'
                        ? 'border-[#E4C98C] text-[#875E0D] bg-[#FDF5E3]'
                        : h.status === 'Escalated for Clinical Check'
                          ? 'border-[#B4D9B1] text-[#245920] bg-[#EAF5E9]'
                          : 'border-[#D5C8B4] text-[#555A50] bg-[#EFE7DA]'
                    }`}
                  >
                    {h.status}
                  </span>
                </div>

                <p className="text-sm text-[#32372E] leading-relaxed">{h.structuralRationale}</p>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4D9C7]">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectMechanism(h.targetProteinId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] text-xs font-semibold hover:bg-[#DCEAF7] transition-colors"
                    >
                      <Microscope className="w-3.5 h-3.5" />
                      Inspect {h.targetProteinId} in 3D Lens
                    </button>
                    {h.evidenceSource && (
                      <a
                        href={h.evidenceSource}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-[#29659B] hover:underline"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {h.reviewedBy && (
                      <span className="text-xs font-mono text-[#555A50] mr-2">
                        Reviewed by {h.reviewedBy} ({h.reviewedAt})
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void review(h.id, 'escalate')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF5E9] border border-[#B4D9B1] text-[#245920] text-xs font-semibold hover:bg-[#DDF0DB] transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Escalate for Clinical Review
                    </button>
                    <button
                      type="button"
                      onClick={() => void review(h.id, 'dismiss')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C6B69E] bg-[#EFE7DA] text-[#32372E] text-xs font-medium hover:bg-[#E5DAC7] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-5">
          <div className="space-y-3">
            {evidence.map((ev) => (
              <div key={ev.id} className="organelle-panel rounded-xl p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span className="px-2 py-0.5 rounded bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] font-semibold">
                      {ev.target}
                    </span>
                    <span className="font-semibold text-[#1E221D]">{ev.drug}</span>
                    <span className="text-[#555A50]">({ev.relationship})</span>
                  </div>
                  <span
                    className={`font-mono px-2 py-0.5 rounded border ${
                      ev.structureKind === 'experimental'
                        ? 'bg-[#EAF5E9] border-[#B4D9B1] text-[#245920]'
                        : 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D]'
                    }`}
                  >
                    {ev.structureKind === 'experimental' ? `PDB ${ev.accession}` : `AlphaFold ${ev.accession}`}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-[#4F544C]">
                  {ev.method}
                  {ev.confidence ? ` · ${ev.confidence}` : ''} · Locator: {ev.locator}
                </div>
                <p className="text-[#3C4138] leading-relaxed">{ev.limitation}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4D9C7]">
                  <span className="font-mono text-[11px] text-[#555A50]">
                    Reviewed by {ev.reviewedBy} ({ev.reviewedAt})
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onInspectMechanism(ev.target)}
                      className="text-[#29659B] hover:underline font-semibold"
                    >
                      Open in 3D Lens
                    </button>
                    <a
                      href={ev.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#556B22] hover:underline font-semibold"
                    >
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={addMolecularEvidence} className="organelle-panel rounded-xl p-5 space-y-3 h-fit">
            <h3 className="text-sm font-semibold text-[#1E221D]">Add Curated Molecular Evidence</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={evTarget}
                onChange={(e) => setEvTarget(e.target.value as MechanismTargetId)}
                className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs font-mono text-[#1E221D]"
              >
                {TARGET_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={evRel}
                onChange={(e) =>
                  setEvRel(e.target.value as MolecularEvidenceEntry['relationship'])
                }
                className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs text-[#1E221D]"
              >
                <option value="inhibition">Inhibition</option>
                <option value="metabolism">Metabolism</option>
                <option value="induction">Induction</option>
                <option value="target">Target</option>
                <option value="transport">Transport</option>
              </select>
            </div>
            <input
              required
              value={evDrug}
              onChange={(e) => setEvDrug(e.target.value)}
              placeholder="Drug / pair (e.g., clarithromycin + simvastatin)"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={evKind}
                onChange={(e) => setEvKind(e.target.value as 'experimental' | 'predicted')}
                className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs text-[#1E221D]"
              >
                <option value="experimental">Experimental (PDB)</option>
                <option value="predicted">AlphaFold Predicted</option>
              </select>
              <input
                required
                value={evAccession}
                onChange={(e) => setEvAccession(e.target.value)}
                placeholder="Accession (e.g., 1TQN / P08684)"
                className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs font-mono text-[#1E221D]"
              />
            </div>
            <input
              required
              value={evLocator}
              onChange={(e) => setEvLocator(e.target.value)}
              placeholder="Locator (e.g., DailyMed §7 / PDB 1TQN)"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
            />
            <textarea
              rows={2}
              value={evLimitation}
              onChange={(e) => setEvLimitation(e.target.value)}
              placeholder="Limitation / interpretation boundary"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
            />
            {evError && (
              <div className="text-xs text-[#8B152A] bg-[#FCEBEF] border border-[#E2A9B3] rounded-lg px-3 py-2">
                {evError}
              </div>
            )}
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#29659B] hover:bg-[#1F507D] text-[#FCF9F4] text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Save Molecular Evidence
            </button>
          </form>
        </div>
      )}

      {activeTab === 'governance' && governance && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="organelle-panel rounded-xl p-4">
              <div className="font-mono text-[#555A50]">Governed Rules</div>
              <div className="text-2xl font-mono font-bold text-[#245920] mt-1">
                {governance.governed}
              </div>
            </div>
            <div className="organelle-panel rounded-xl p-4">
              <div className="font-mono text-[#555A50]">Missing Fields</div>
              <div className="text-2xl font-mono font-bold text-[#875E0D] mt-1">
                {governance.notGoverned}
              </div>
            </div>
            <div className="organelle-panel rounded-xl p-4">
              <div className="font-mono text-[#555A50]">Expired Reviews</div>
              <div className="text-2xl font-mono font-bold text-[#8B152A] mt-1">
                {governance.expiredCount}
              </div>
            </div>
            <div className="organelle-panel rounded-xl p-4">
              <div className="font-mono text-[#555A50]">Total Tracked</div>
              <div className="text-2xl font-mono font-bold text-[#1E221D] mt-1">
                {governance.total}
              </div>
            </div>
          </div>

          <div className="organelle-panel rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#1E221D]">
              Clinical Rule Governance & Review Expiration Audit
            </h3>
            <div className="overflow-x-auto border border-[#D5C8B4] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#EFE7DA] text-[#4F544C] font-mono">
                  <tr>
                    <th className="px-3 py-2">Ingredients</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Jurisdiction</th>
                    <th className="px-3 py-2">Governed</th>
                    <th className="px-3 py-2">Reviewed By</th>
                    <th className="px-3 py-2">Re-review Date</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4D9C7] bg-[#FCF9F4]">
                  {governance.rules.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 font-semibold text-[#1E221D]">
                        {r.ingredients.join(' + ')}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#4F544C]">{r.kind}</td>
                      <td className="px-3 py-2.5 text-[#3C4138]">{r.jurisdiction}</td>
                      <td className="px-3 py-2.5 font-mono">
                        {r.governed ? (
                          <span className="text-[#245920] font-semibold">Yes</span>
                        ) : (
                          <span className="text-[#8B152A] font-semibold">
                            Missing: {r.missing.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#3C4138]">
                        {r.reviewedBy || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#555A50]">
                        {r.reReviewAt || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#4F544C]">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

