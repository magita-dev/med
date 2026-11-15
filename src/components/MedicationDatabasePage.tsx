import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Microscope,
  Play,
  Scale,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  CLINICAL_RAG_SOURCES,
  MEDICATION_RAG_DATABASE,
  findMedicationRagRecords,
  type MedicationRagEntry,
  type MedicationRagSource,
} from '../data/medicationDatabase.ts';
import type {
  LanguageCode,
  MechanismTargetId,
  RagSafetyStatus,
  SamplePreset,
} from '../types/medguard.ts';

interface MedicationDatabasePageProps {
  language: LanguageCode;
  onSelectPreset: (preset: SamplePreset, autoVerify: boolean) => void;
  onOpenMechanism: (targetId: MechanismTargetId) => void;
  onOpenScanner: () => void;
}

const STATUS_FILTERS: Array<{ id: 'ALL' | RagSafetyStatus; label: string }> = [
  { id: 'ALL', label: 'All Records' },
  { id: 'REFERENCE', label: 'Reference' },
  { id: 'POTENTIALLY_UNSAFE', label: 'Potentially Unsafe' },
  { id: 'RESTRICTED', label: 'Restricted' },
  { id: 'CONTRAINDICATED', label: 'Contraindicated' },
];

function buildPresetFromRagEntry(entry: MedicationRagEntry, weightKg: number): SamplePreset {
  const safeWeight = weightKg > 0 ? weightKg : 14;
  const isContraOrUnsafe = entry.safety_status !== 'REFERENCE';
  const testAge =
    entry.active_ingredient === 'ibuprofen' && isContraOrUnsafe
      ? 0.2
      : entry.active_ingredient === 'metoclopramide'
        ? 0.8
        : entry.active_ingredient === 'nimesulide'
          ? 8
          : entry.active_ingredient === 'chlorpheniramine'
            ? 3
            : 5;

  const isDailyBasis = entry.reference_dose.toLowerCase().includes('/day');
  const rawPerAdmin =
    entry.mg_per_kg_max && isContraOrUnsafe
      ? Math.round(entry.mg_per_kg_max * safeWeight * 1.35)
      : entry.mg_per_kg_min
        ? Math.round(entry.mg_per_kg_min * safeWeight)
        : 250;

  const freq =
    entry.max_doses_per_day && isContraOrUnsafe
      ? entry.max_doses_per_day + 1
      : entry.max_doses_per_day ?? 2;

  const dosePerAdmin =
    isDailyBasis && freq > 1 ? Math.round(rawPerAdmin / freq) : rawPerAdmin;

  const brand = entry.brand_examples[0] ?? entry.medicine_name;
  const rawLine = `${brand} (${entry.active_ingredient}) ${dosePerAdmin} mg — ${freq}x/day (${entry.route})`;

  return {
    id: `rag-test-${entry.id}`,
    label: `${entry.medicine_name} (${entry.safety_status})`,
    subtitle: `${entry.age_range} · ${entry.source}`,
    patientCondition:
      entry.active_ingredient === 'amoxicillin' || entry.active_ingredient === 'azithromycin'
        ? 'Bacterial Infection'
        : entry.active_ingredient === 'cetirizine'
          ? 'Allergic Rhinitis'
          : entry.active_ingredient === 'metoclopramide'
            ? 'Vomiting'
            : 'Fever and Pain',
    patientAge: testAge,
    rawPrescriptionText: `Rx (Pediatric ${testAge} yrs, ${safeWeight} kg):\n1. ${rawLine}`,
    items: [
      {
        id: `rag-item-${entry.id}`,
        brandName: brand,
        activeIngredients: [entry.active_ingredient],
        strengthMg: dosePerAdmin,
        frequencyPerDay: freq,
        totalDailyMg: Math.round(dosePerAdmin * freq * 100) / 100,
        durationDays: 3,
        route: entry.route,
        batchNumber: 'RAG-DEMO',
        manufacturer: 'Formulary Test Entry',
        rawLine,
      },
    ],
  };
}

export function MedicationDatabasePage({
  language,
  onSelectPreset,
  onOpenMechanism,
  onOpenScanner,
}: MedicationDatabasePageProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RagSafetyStatus>('ALL');
  const [weightInput, setWeightInput] = useState('14');
  const [apiRecords, setApiRecords] = useState<MedicationRagEntry[]>(MEDICATION_RAG_DATABASE);
  const [apiSources, setApiSources] = useState<MedicationRagSource[]>(CLINICAL_RAG_SOURCES);

  useEffect(() => {
    let active = true;
    fetch('/api/rag/records')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.records) && data.records.length > 0) {
          setApiRecords(data.records);
        }
        if (Array.isArray(data.sources) && data.sources.length > 0) {
          setApiSources(data.sources);
        }
      })
      .catch(() => {
        // Keep bundled MEDICATION_RAG_DATABASE fallback
      });
    return () => {
      active = false;
    };
  }, []);

  const weightKg = Number(weightInput) > 0 ? Number(weightInput) : 0;

  const filteredRecords = useMemo(() => {
    const queryMatches = new Set(findMedicationRagRecords(query, 'pediatric').map((r) => r.id));
    return apiRecords.filter((entry) => {
      if (query.trim() && !queryMatches.has(entry.id)) {
        const q = query.trim().toLowerCase();
        const hit =
          entry.medicine_name.toLowerCase().includes(q) ||
          entry.active_ingredient.toLowerCase().includes(q) ||
          entry.brand_examples.some((b) => b.toLowerCase().includes(q)) ||
          entry.source.toLowerCase().includes(q) ||
          entry.reason.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter !== 'ALL' && entry.safety_status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [apiRecords, query, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: apiRecords.length,
      reference: apiRecords.filter((r) => r.safety_status === 'REFERENCE').length,
      unsafe: apiRecords.filter((r) => r.safety_status === 'POTENTIALLY_UNSAFE').length,
      contraOrRestricted: apiRecords.filter(
        (r) => r.safety_status === 'CONTRAINDICATED' || r.safety_status === 'RESTRICTED'
      ).length,
    };
  }, [apiRecords]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="organelle-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono text-[#556B22] font-semibold">
            <Database className="w-3.5 h-3.5" />
            <span>PEDIATRIC MEDICATION RAG DATABASE · CDSCO · IAP · WHO</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#1E221D]">
            {language === 'ta'
              ? 'குழந்தைகள் மருந்து பாதுகாப்பு & RAG குறிப்புத் தொகுப்பு'
              : language === 'hi'
                ? 'बाल चिकित्सा दवा सुरक्षा और RAG संदर्भ डेटाबेस'
                : 'Pediatric Medication RAG Knowledge Base'}
          </h2>
          <p className="text-xs sm:text-sm text-[#4F544C] leading-relaxed">
            Explore all {counts.total} curated clinical entries—weight-based reference monographs, unsafe dosing triggers, contraindications, drug interactions, and Indian brand examples—or load any entry directly into the Scan Here verifier.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenScanner}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <span>Open Scan Here</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* Summary Metrics + Search + Weight Calculator */}
      <section className="organelle-panel rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="organelle-subpanel rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] font-mono text-[#555A50]">TOTAL RAG ENTRIES</div>
            <div className="font-display text-xl font-bold text-[#1E221D] mt-0.5">
              {counts.total}
            </div>
          </div>
          <div className="rounded-lg px-3.5 py-2.5 bg-[#EAF5E9] border border-[#B4D9B1]">
            <div className="text-[11px] font-mono text-[#245920]">REFERENCE GUIDES</div>
            <div className="font-display text-xl font-bold text-[#245920] mt-0.5">
              {counts.reference}
            </div>
          </div>
          <div className="rounded-lg px-3.5 py-2.5 bg-[#FDF5E3] border border-[#E4C98C]">
            <div className="text-[11px] font-mono text-[#875E0D]">POTENTIALLY UNSAFE</div>
            <div className="font-display text-xl font-bold text-[#875E0D] mt-0.5">
              {counts.unsafe}
            </div>
          </div>
          <div className="rounded-lg px-3.5 py-2.5 bg-[#FCEBEF] border border-[#E2A9B3]">
            <div className="text-[11px] font-mono text-[#8B152A]">CONTRAINDICATED / RESTRICTED</div>
            <div className="font-display text-xl font-bold text-[#8B152A] mt-0.5">
              {counts.contraOrRestricted}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_220px] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-[#3C4138] mb-1">
              Search Medicine, Brand (Crocin, Brufen, Mox, Sinarest), Ingredient, or Guideline Source
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#555A50] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., Paracetamol, Calpol, Amoxicillin, Nimesulide, CDSCO..."
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] pl-9 pr-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#3C4138] mb-1">
              <Scale className="w-3.5 h-3.5 text-[#29659B]" />
              <span>Child Weight Calculator (kg)</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              step="0.5"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="e.g., 14"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#29659B]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                statusFilter === filter.id
                  ? 'bg-[#556B22] border-[#556B22] text-[#FCF9F4]'
                  : 'bg-[#EFE7DA] border-[#D5C8B4] text-[#3C4138] hover:bg-[#E5DAC7]'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <span className="ml-auto text-xs font-mono text-[#555A50]">
            Showing {filteredRecords.length} of {apiRecords.length} entries
          </span>
        </div>
      </section>

      {/* Medication Entries Grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {filteredRecords.map((entry) => {
          const isRef = entry.safety_status === 'REFERENCE';
          const isContra = entry.safety_status === 'CONTRAINDICATED';
          const isDailyBasis = entry.reference_dose.toLowerCase().includes('/day');
          const calculatedRange =
            weightKg > 0 && entry.mg_per_kg_min && entry.mg_per_kg_max
              ? `${Math.round(entry.mg_per_kg_min * weightKg * 10) / 10}–${Math.round(entry.mg_per_kg_max * weightKg * 10) / 10} ${isDailyBasis ? 'mg/day' : 'mg/dose'}`
              : null;

          return (
            <article
              key={entry.id}
              className={`rounded-xl p-5 border flex flex-col justify-between gap-4 text-xs ${
                isRef
                  ? 'bg-[#FCF9F4] border-[#C6B69E]'
                  : isContra
                    ? 'bg-[#FCEBEF] border-[#E2A9B3]'
                    : 'bg-[#FDF5E3] border-[#E4C98C]'
              }`}
            >
              <div className="space-y-3">
                {/* Top Meta */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          isRef
                            ? 'text-[#245920]'
                            : isContra
                              ? 'text-[#8B152A]'
                              : 'text-[#875E0D]'
                        }`}
                      >
                        {isRef ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isContra ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        {entry.safety_status}
                      </span>
                      <span className="text-[#555A50]">· {entry.action}</span>
                      <span className="text-[#555A50]">· {entry.evidence_level}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#1E221D]">
                      {entry.medicine_name}
                    </h3>
                    <div className="text-[#4F544C]">
                      <span className="font-mono text-[#29659B] font-semibold">
                        {entry.active_ingredient}
                      </span>
                      {' · '}
                      <span>Brands: {entry.brand_examples.join(', ')}</span>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded bg-[#EFE7DA] border border-[#D5C8B4] font-mono text-[11px] font-semibold text-[#1E221D]">
                    {entry.patient_group.toUpperCase()}
                  </span>
                </div>

                {entry.scenario && (
                  <div className="rounded-lg bg-[#FCF9F4] border border-[#D5C8B4] px-3 py-2 font-medium text-[#1E221D]">
                    Scenario: {entry.scenario}
                  </div>
                )}

                <p className="text-[#2B3028] leading-relaxed">{entry.reason}</p>

                {/* Dosing Grid */}
                <div className="grid sm:grid-cols-2 gap-2.5 bg-[#FCF9F4] border border-[#D5C8B4] rounded-lg p-3">
                  <div>
                    <div className="text-[11px] font-mono text-[#555A50]">REFERENCE DOSE</div>
                    <div className="font-semibold text-[#1E221D] mt-0.5">{entry.reference_dose}</div>
                    {calculatedRange && (
                      <div className="text-[11px] font-mono text-[#29659B] font-semibold mt-1">
                        For {weightKg} kg: {calculatedRange}
                        {entry.max_doses_per_day ? ` (max ${entry.max_doses_per_day}x/24h)` : ''}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-[#555A50]">AGE RANGE & ROUTE</div>
                    <div className="font-medium text-[#1E221D] mt-0.5">
                      {entry.age_range} · {entry.route}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-[#555A50]">FREQUENCY & MAXIMUM</div>
                    <div className="text-[#2B3028] mt-0.5">
                      {entry.frequency}. {entry.maximum}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-[#555A50]">WEIGHT GUIDANCE</div>
                    <div className="text-[#2B3028] mt-0.5">{entry.weight_guidance}</div>
                  </div>
                </div>

                {/* Mandatory Verification Flags */}
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      entry.requires_weight_check
                        ? 'bg-[#E9F1F9] border-[#B3CDE5] text-[#1A4B7A]'
                        : 'bg-[#EFE7DA] border-[#D5C8B4] text-[#555A50]'
                    }`}
                  >
                    Weight Check: {entry.requires_weight_check ? 'Required' : 'Age-Banded'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      entry.requires_formulation_check
                        ? 'bg-[#E9F1F9] border-[#B3CDE5] text-[#1A4B7A]'
                        : 'bg-[#EFE7DA] border-[#D5C8B4] text-[#555A50]'
                    }`}
                  >
                    Formulation Check: {entry.requires_formulation_check ? 'Required' : 'Standard'}
                  </span>
                </div>

                {/* Contraindications & Interactions */}
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="rounded-lg bg-[#FCF9F4] border border-[#E4D9C7] p-2.5 space-y-1">
                    <div className="text-[11px] font-mono text-[#8B152A] font-semibold">
                      CONTRAINDICATIONS
                    </div>
                    <ul className="space-y-0.5 text-[#3C4138]">
                      {entry.contraindications.map((c, idx) => (
                        <li key={idx}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-[#FCF9F4] border border-[#E4D9C7] p-2.5 space-y-1">
                    <div className="text-[11px] font-mono text-[#875E0D] font-semibold">
                      INTERACTIONS
                    </div>
                    <ul className="space-y-0.5 text-[#3C4138]">
                      {entry.interactions.map((intr, idx) => (
                        <li key={idx}>• {intr}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommended Action Steps */}
                <div className="space-y-1">
                  <div className="text-[11px] font-mono text-[#556B22] font-semibold">
                    RECOMMENDED ACTION
                  </div>
                  <ul className="space-y-0.5 text-[#2B3028]">
                    {entry.recommended_action.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="font-mono text-[#556B22] font-bold">•</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-[#D5C8B4] flex flex-wrap items-center justify-between gap-2">
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-[#29659B] hover:underline"
                >
                  <span>{entry.source}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenMechanism(entry.mechanism_target_id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] hover:bg-[#DCEAF7] font-semibold transition-colors"
                  >
                    <Microscope className="w-3.5 h-3.5" />
                    3D {entry.mechanism_target_id}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPreset(buildPresetFromRagEntry(entry, weightKg), true)
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] font-semibold transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Test in Scan Here
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {filteredRecords.length === 0 && (
          <div className="lg:col-span-2 organelle-panel rounded-xl p-8 text-center text-sm text-[#555A50]">
            No entries matched &ldquo;{query}&rdquo; under filter {statusFilter}. Clear search or switch filter to view all {apiRecords.length} medications.
          </div>
        )}
      </div>

      {/* Authoritative Regulatory & Formulary Sources */}
      <section className="organelle-panel rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#29659B]" />
          <h3 className="font-display text-lg font-bold text-[#1E221D]">
            Authoritative Pediatric Sources Cited in MedGuard RAG
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {apiSources.map((src) => (
            <a
              key={src.id}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              className="organelle-subpanel rounded-lg p-3.5 hover:border-[#29659B] transition-colors flex flex-col justify-between gap-2 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#1E221D]">{src.name}</span>
                  <span className="font-mono text-[11px] text-[#556B22] font-semibold">
                    {src.evidenceLevel}
                  </span>
                </div>
                <p className="text-[#4F544C] leading-relaxed">{src.scope}</p>
              </div>
              <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[#29659B]">
                <span>{src.url}</span>
                <ExternalLink className="w-3 h-3" />
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
