import {
  MEDICATION_RAG_DATABASE,
  type MedicationRagEntry,
} from '../data/medicationDatabase.ts';
import type { PatientHealthQuiz, PrescriptionItem } from '../types/medguard.ts';

export type DosageSafetyFlagLevel =
  | 'SAFE'
  | 'POTENTIALLY_UNSAFE'
  | 'RESTRICTED'
  | 'CONTRAINDICATED';

export interface MedicationDosageFlag {
  itemId: string;
  medicineName: string;
  activeIngredient: string;
  brandName: string;
  matchedEntry: MedicationRagEntry;
  unsafeEntry?: MedicationRagEntry;
  safetyLevel: DosageSafetyFlagLevel;
  isPotentiallyUnsafe: boolean;
  reasons: string[];
  recommendedActions: string[];
  referenceDose: string;
  source: string;
  sourceUrl: string;
}

export interface ConditionAgeDosageEvaluation {
  overallSafe: boolean;
  flaggedCount: number;
  patientCondition: string;
  patientAgeYears: number;
  patientAgeMonths: number;
  patientGroup: 'pediatric' | 'adult' | 'elderly';
  flags: MedicationDosageFlag[];
}

const CONDITION_CONTRAINDICATION_KEYWORDS: Array<{
  conditionTerms: string[];
  contraTerms: string[];
  label: string;
}> = [
  {
    conditionTerms: ['viral', 'flu', 'influenza', 'chickenpox', 'varicella'],
    contraTerms: ['viral', 'reye', 'varicella'],
    label: 'Viral illness contraindication / mismatch',
  },
  {
    conditionTerms: ['dengue', 'dehydration', 'vomit', 'diarrhea', 'diarrhoea'],
    contraTerms: ['dengue', 'dehydration'],
    label: 'Dehydration or dengue hemorrhagic risk',
  },
  {
    conditionTerms: ['liver', 'hepatic', 'hepatitis', 'jaundice', 'cirrhosis'],
    contraTerms: ['hepatic', 'liver'],
    label: 'Hepatic impairment contraindication',
  },
  {
    conditionTerms: ['kidney', 'renal', 'ckd', 'nephro'],
    contraTerms: ['renal', 'kidney'],
    label: 'Renal impairment contraindication',
  },
  {
    conditionTerms: ['ulcer', 'gastritis', 'bleed', 'gi bleed', 'hemorrhage'],
    contraTerms: ['bleed', 'ulcer', 'gi'],
    label: 'Gastrointestinal bleeding or ulcer risk',
  },
  {
    conditionTerms: ['arrhythmia', 'qt', 'cardiac', 'heart rhythm', 'palpitation'],
    contraTerms: ['qt', 'arrhythmia'],
    label: 'Cardiac QT prolongation / arrhythmia risk',
  },
  {
    conditionTerms: ['seizure', 'epilepsy', 'dystonia'],
    contraTerms: ['seizure', 'extrapyramidal'],
    label: 'Neurological / extrapyramidal contraindication',
  },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function findMatchingDatabaseEntries(
  item: Pick<PrescriptionItem, 'brandName' | 'activeIngredients'>
): MedicationRagEntry[] {
  const candidates = [
    ...item.activeIngredients.map(normalizeText),
    normalizeText(item.brandName),
  ].filter(Boolean);

  return MEDICATION_RAG_DATABASE.filter((entry) => {
    const ing = entry.active_ingredient.toLowerCase();
    const med = entry.medicine_name.toLowerCase();
    const brands = entry.brand_examples.map((b) => b.toLowerCase());

    return candidates.some(
      (c) =>
        c === ing ||
        c.includes(ing) ||
        ing.includes(c) ||
        c === med ||
        med.includes(c) ||
        brands.some((b) => c.includes(b) || b.includes(c))
    );
  });
}

function matchConditionContraindications(
  patientCondition: string,
  entries: MedicationRagEntry[]
): string[] {
  const conditionNorm = normalizeText(patientCondition);
  if (!conditionNorm) return [];

  const matchedReasons = new Set<string>();
  const allContraindications = entries.flatMap((e) => e.contraindications);

  for (const contra of allContraindications) {
    const contraNorm = normalizeText(contra);
    const significantWords = contraNorm
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !['with', 'under', 'years', 'months', 'without'].includes(w));

    if (significantWords.some((word) => conditionNorm.includes(word))) {
      matchedReasons.add(
        `Condition "${patientCondition.trim()}" conflicts with database contraindication: ${contra}.`
      );
    }
  }

  for (const mapping of CONDITION_CONTRAINDICATION_KEYWORDS) {
    const userMatches = mapping.conditionTerms.some((t) => conditionNorm.includes(t));
    if (!userMatches) continue;

    const entryMatch = allContraindications.find((c) => {
      const lc = c.toLowerCase();
      return mapping.contraTerms.some((ct) => lc.includes(ct));
    });
    if (entryMatch) {
      matchedReasons.add(
        `${mapping.label} for condition "${patientCondition.trim()}" (${entryMatch}).`
      );
    }
  }

  return Array.from(matchedReasons);
}

export function flagUnsafeDosagesByConditionAndAge(params: {
  items: PrescriptionItem[];
  patientCondition: string;
  patientAge: number;
  patientWeightKg?: number;
  patientAgeMonths?: number;
  quizProfile?: PatientHealthQuiz;
}): ConditionAgeDosageEvaluation {
  const ageYears = Math.max(0, Number(params.patientAge) || 0);
  const ageMonths =
    params.patientAgeMonths !== undefined
      ? Math.max(0, params.patientAgeMonths)
      : ageYears * 12;
  const patientGroup: ConditionAgeDosageEvaluation['patientGroup'] =
    ageYears < 18 ? 'pediatric' : ageYears >= 65 ? 'elderly' : 'adult';
  const conditionStr = params.patientCondition?.trim() || '';

  const flags: MedicationDosageFlag[] = [];

  for (const item of params.items) {
    const matchedEntries = findMatchingDatabaseEntries(item);
    if (matchedEntries.length === 0) continue;

    const refEntry =
      matchedEntries.find((e) => e.safety_status === 'REFERENCE') ?? matchedEntries[0];
    const unsafeEntry = matchedEntries.find(
      (e) =>
        e.safety_status === 'CONTRAINDICATED' ||
        e.safety_status === 'POTENTIALLY_UNSAFE' ||
        e.safety_status === 'RESTRICTED'
    );

    const reasons: string[] = [];
    let level: DosageSafetyFlagLevel = 'SAFE';

    const escalateLevel = (next: DosageSafetyFlagLevel) => {
      const rank: Record<DosageSafetyFlagLevel, number> = {
        SAFE: 0,
        RESTRICTED: 1,
        POTENTIALLY_UNSAFE: 2,
        CONTRAINDICATED: 3,
      };
      if (rank[next] > rank[level]) level = next;
    };

    // 1. Evaluate age thresholds from medicationDatabase.ts
    if (patientGroup === 'pediatric') {
      if (refEntry.min_age_months !== undefined && ageMonths < refEntry.min_age_months) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Patient age (${ageYears} yrs / ${ageMonths} mo) is below the minimum safe age of ${refEntry.min_age_months} months for ${refEntry.medicine_name}.`
        );
      }

      if (refEntry.active_ingredient === 'nimesulide' && ageYears < 12) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Nimesulide is prohibited by CDSCO for children under 12 years (patient age: ${ageYears} yrs).`
        );
      }

      if (refEntry.active_ingredient === 'chlorpheniramine' && ageYears < 4) {
        escalateLevel('RESTRICTED');
        reasons.push(
          `Combination cough/cold products containing Chlorpheniramine are CDSCO-restricted under 4 years (patient age: ${ageYears} yrs).`
        );
      }

      if (refEntry.active_ingredient === 'metoclopramide' && ageYears < 1) {
        escalateLevel('CONTRAINDICATED');
        reasons.push('Metoclopramide is contraindicated in infants under 1 year.');
      }

      if (unsafeEntry?.safety_status === 'CONTRAINDICATED') {
        escalateLevel('CONTRAINDICATED');
        reasons.push(unsafeEntry.reason);
      } else if (unsafeEntry?.safety_status === 'RESTRICTED') {
        escalateLevel('RESTRICTED');
        reasons.push(unsafeEntry.reason);
      }

      // 2. Evaluate frequency & weight-based mg/kg limits
      const freq = Number(item.frequencyPerDay) || 0;
      if (refEntry.max_doses_per_day && freq > refEntry.max_doses_per_day) {
        escalateLevel('POTENTIALLY_UNSAFE');
        reasons.push(
          `Prescribed ${freq} doses/day exceeds maximum ${refEntry.max_doses_per_day} doses/24h (${refEntry.maximum}).`
        );
      }

      if (refEntry.requires_weight_check) {
        const weight = params.patientWeightKg;
        if (weight && weight > 0 && refEntry.mg_per_kg_max !== undefined) {
          const singleDoseMg = Number(item.strengthMg) || 0;
          const singleMgPerKg = singleDoseMg / weight;
          const dailyMg = Number(item.totalDailyMg) || singleDoseMg * Math.max(1, freq);
          const maxDailyPerKg =
            refEntry.mg_per_kg_max * (refEntry.max_doses_per_day ?? Math.max(1, freq));

          // Check whether reference is mg/kg/day (amoxicillin/azithromycin) or mg/kg/dose (paracetamol/ibuprofen)
          const isDailyRef = refEntry.reference_dose.toLowerCase().includes('/day');
          if (isDailyRef) {
            const actualDailyMgPerKg = dailyMg / weight;
            if (actualDailyMgPerKg > refEntry.mg_per_kg_max) {
              escalateLevel('POTENTIALLY_UNSAFE');
              reasons.push(
                `Daily dose ${Math.round(actualDailyMgPerKg * 10) / 10} mg/kg/day exceeds upper reference ${refEntry.mg_per_kg_max} mg/kg/day for a ${weight} kg child.`
              );
            }
          } else {
            if (singleMgPerKg > refEntry.mg_per_kg_max) {
              escalateLevel('POTENTIALLY_UNSAFE');
              reasons.push(
                `Single dose ${singleDoseMg} mg (${Math.round(singleMgPerKg * 10) / 10} mg/kg) exceeds ${refEntry.mg_per_kg_max} mg/kg/dose limit for a ${weight} kg child.`
              );
            }
            if (dailyMg / weight > maxDailyPerKg) {
              escalateLevel('POTENTIALLY_UNSAFE');
              reasons.push(
                `Total daily intake (${dailyMg} mg/day) exceeds pediatric ceiling of ${Math.round(
                  maxDailyPerKg * weight
                )} mg/day for a ${weight} kg child.`
              );
            }
          }
        } else {
          escalateLevel('POTENTIALLY_UNSAFE');
          reasons.push(
            `Pediatric weight (kg) is unverified for weight-dependent ${refEntry.medicine_name} (${refEntry.reference_dose}).`
          );
        }

        if (ageYears < 12 && Number(item.strengthMg) >= 500) {
          escalateLevel('POTENTIALLY_UNSAFE');
          reasons.push(
            `Fixed adult strength (${item.strengthMg} mg) detected for age ${ageYears} yrs; confirm pediatric suspension/weight dose.`
          );
        }
      }
    } else if (patientGroup === 'elderly') {
      // Elderly caution for NSAIDs & sedating antihistamines in database
      if (['ibuprofen', 'diclofenac', 'nimesulide', 'aspirin'].includes(refEntry.active_ingredient)) {
        if (Number(item.totalDailyMg) > 1200 || refEntry.active_ingredient === 'diclofenac') {
          escalateLevel('POTENTIALLY_UNSAFE');
          reasons.push(
            `Elderly patient (age ${ageYears} yrs): ${refEntry.medicine_name} increases renal and GI bleeding risk; use lowest effective dose for shortest duration.`
          );
        }
      }
    }

    // 3. Evaluate user-specified condition against database contraindications
    const conditionMatches = matchConditionContraindications(conditionStr, matchedEntries);
    if (conditionMatches.length > 0) {
      escalateLevel(
        unsafeEntry?.safety_status === 'CONTRAINDICATED'
          ? 'CONTRAINDICATED'
          : 'POTENTIALLY_UNSAFE'
      );
      reasons.push(...conditionMatches);
    }

    // 4. Cross-check against Patient Health & Fatal-Risk Quiz factors
    const qp = params.quizProfile;
    if (qp) {
      const ing = refEntry.active_ingredient.toLowerCase();
      const factors = qp.fatalRiskFactors ?? [];
      if (
        (qp.surgeryStatus !== 'none' || factors.includes('gi_ulcer_or_bleed') || factors.includes('anticoagulant_therapy')) &&
        ['ibuprofen', 'diclofenac', 'nimesulide', 'aspirin', 'etodolac'].includes(ing)
      ) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Patient Health Quiz flagged surgery/bleeding/anticoagulant risk: ${refEntry.medicine_name} carries fatal hemorrhage hazard.`
        );
      }
      if (
        (factors.includes('severe_liver_disease') || factors.includes('chronic_alcohol_use')) &&
        (ing === 'paracetamol' || ing === 'nimesulide' || ing === 'atorvastatin' || ing === 'simvastatin')
      ) {
        const dailyMg = Number(item.totalDailyMg) || Number(item.strengthMg) * Math.max(1, Number(item.frequencyPerDay) || 1);
        if (ing !== 'paracetamol' || factors.includes('severe_liver_disease') || dailyMg > 2000) {
          escalateLevel('CONTRAINDICATED');
          reasons.push(
            `Patient Health Quiz flagged hepatic/alcohol risk: ${refEntry.medicine_name} (${dailyMg} mg/day) risks acute hepatotoxicity.`
          );
        }
      }
      if (factors.includes('severe_kidney_ckd') && ['metformin', 'ibuprofen', 'diclofenac', 'nimesulide', 'aspirin'].includes(ing)) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Patient Health Quiz flagged severe renal/CKD risk: ${refEntry.medicine_name} is contraindicated due to fatal lactic acidosis / acute renal failure risk.`
        );
      }
      if (factors.includes('cardiac_qt_or_arrhythmia') && ['azithromycin', 'clarithromycin', 'domperidone', 'ciprofloxacin'].includes(ing)) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Patient Health Quiz flagged cardiac QT/arrhythmia history: ${refEntry.medicine_name} risks Torsades de Pointes.`
        );
      }
      if (factors.includes('pregnancy_or_breastfeeding') && ['atorvastatin', 'simvastatin', 'ibuprofen', 'diclofenac', 'nimesulide', 'telmisartan'].includes(ing)) {
        escalateLevel('CONTRAINDICATED');
        reasons.push(
          `Patient Health Quiz flagged pregnancy/breastfeeding: ${refEntry.medicine_name} carries fetal/teratogenic risk.`
        );
      }
    }

    const activeSourceEntry = level !== 'SAFE' && unsafeEntry ? unsafeEntry : refEntry;
    const isPotentiallyUnsafe = level !== 'SAFE';

    flags.push({
      itemId: item.id,
      medicineName: refEntry.medicine_name,
      activeIngredient: refEntry.active_ingredient,
      brandName: item.brandName,
      matchedEntry: refEntry,
      unsafeEntry,
      safetyLevel: level,
      isPotentiallyUnsafe,
      reasons: Array.from(new Set(reasons)),
      recommendedActions: activeSourceEntry.recommended_action,
      referenceDose: refEntry.reference_dose,
      source: activeSourceEntry.source,
      sourceUrl: activeSourceEntry.source_url,
    });
  }

  const flaggedCount = flags.filter((f) => f.isPotentiallyUnsafe).length;

  return {
    overallSafe: flaggedCount === 0,
    flaggedCount,
    patientCondition: conditionStr,
    patientAgeYears: ageYears,
    patientAgeMonths: ageMonths,
    patientGroup,
    flags,
  };
}

export function evaluateMedicineAgainstDatabase(
  medicineOrIngredient: string,
  patientCondition: string,
  patientAge: number,
  options?: {
    doseMg?: number;
    frequencyPerDay?: number;
    patientWeightKg?: number;
    patientAgeMonths?: number;
  }
): MedicationDosageFlag | null {
  const doseMg = options?.doseMg ?? 0;
  const freq = options?.frequencyPerDay ?? 1;
  const syntheticItem: PrescriptionItem = {
    id: 'single-check',
    brandName: medicineOrIngredient,
    activeIngredients: [medicineOrIngredient.trim().toLowerCase()],
    strengthMg: doseMg,
    frequencyPerDay: freq,
    totalDailyMg: doseMg * freq,
    durationDays: 1,
    route: 'oral',
    batchNumber: '',
    manufacturer: '',
    rawLine: medicineOrIngredient,
  };

  const result = flagUnsafeDosagesByConditionAndAge({
    items: [syntheticItem],
    patientCondition,
    patientAge,
    patientWeightKg: options?.patientWeightKg,
    patientAgeMonths: options?.patientAgeMonths,
  });

  return result.flags[0] ?? null;
}
