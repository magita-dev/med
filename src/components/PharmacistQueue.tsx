import { useEffect, useState } from 'react';
import { Check, Lock, Microscope, X } from 'lucide-react';
import type { MechanismTargetId, PharmacistHypothesis } from '../types/medguard.ts';

interface PharmacistQueueProps {
  onInspectMechanism: (targetId: MechanismTargetId) => void;
}

export function PharmacistQueue({ onInspectMechanism }: PharmacistQueueProps) {
  const [hypotheses, setHypotheses] = useState<PharmacistHypothesis[]>([]);

  useEffect(() => {
    fetch('/api/pharmacist/hypotheses')
      .then((r) => r.json())
      .then((d) => setHypotheses(d.hypotheses ?? []))
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

  return (
    <div className="space-y-5">
      <div className="organelle-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#8E3E1C]">
            <Lock className="w-3.5 h-3.5" />
            <span>PHARMACIST-ONLY GOVERNANCE QUEUE · NEVER EXPOSED TO PATIENTS</span>
          </div>
          <h2 className="font-display text-xl font-semibold text-[#1E221D]">
            Structure-Based AlphaFold & PDB Hypothesis Queue
          </h2>
          <p className="text-xs text-[#555A50] leading-relaxed">
            In MedGuard, predicted 3D structural clashes can explain verified/curated alerts, never create patient-facing warnings on their own. Unverified structural hypotheses route here for clinical pharmacist triage.
          </p>
        </div>
      </div>

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
              <button
                type="button"
                onClick={() => onInspectMechanism(h.targetProteinId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] text-xs font-semibold hover:bg-[#DCEAF7] transition-colors"
              >
                <Microscope className="w-3.5 h-3.5" />
                Inspect {h.targetProteinId} in 3D Lens
              </button>

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
  );
}
