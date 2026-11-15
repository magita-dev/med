import type {
  DiseaseMatchAudit,
  DosageAuditResult,
  ExternalValidationSource,
  FacilityStockItem,
  LanguageCode,
  MechanismTargetId,
  MultilingualExplanation,
  OverallVerdictStatus,
  PackCheckResult,
  PatientHealthQuiz,
  PrescriptionItem,
  QuizRiskFinding,
  RagClinicalRecord,
  RagRetrievedMatch,
  RegimenFinding,
  RegulatorAlertRecord,
  ReverseMatchHit,
  VerificationReport,
} from '../types/medguard.ts';
import {
  DRUG_ALLERGY_OPTIONS,
  FATAL_RISK_FACTOR_OPTIONS,
  SURGICAL_STATUS_OPTIONS,
} from '../data/healthQuizCatalog.ts';
import {
  BANNED_FDC_RULES,
  CONDITION_SYNONYMS,
  DATASET_AS_OF_DATE,
  DOSE_RULES,
  ELDERLY_RISK_RULES,
  INDICATION_RULES,
  INGREDIENT_REFERENCE_LINKS,
  INTERACTION_RULES,
  MECHANISM_TARGETS,
  REGULATOR_ALERTS,
} from '../data/medguardCatalog.ts';
import { RAG_CLINICAL_RECORDS } from '../data/pediatricRagDataset.ts';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ingredientMatches(list: string[], target: string): boolean {
  const t = norm(target);
  return list.some((ing) => {
    const n = norm(ing);
    return n === t || n.includes(t) || t.includes(n);
  });
}

export function verifyPackItem(
  item: PrescriptionItem,
  alerts: RegulatorAlertRecord[] = REGULATOR_ALERTS
): PackCheckResult {
  const pName = norm(item.brandName);
  const bNum = norm(item.batchNumber || '');
  const mfg = norm(item.manufacturer || '');

  for (const alert of alerts) {
    const aProd = norm(alert.productName);
    const aMfg = norm(alert.manufacturer);
    const productMatch =
      (pName.length > 0 && (pName === aProd || pName.includes(aProd) || aProd.includes(pName))) ||
      (alert.activeIngredients.length > 1 &&
        alert.activeIngredients.every((ai) => ingredientMatches(item.activeIngredients, ai)));

    if (!productMatch) continue;

    const manufacturerMatch =
      aMfg.includes('generic') ||
      (mfg.length > 0 && (mfg === aMfg || mfg.includes(aMfg) || aMfg.includes(mfg)));

    const batchMatch =
      alert.batchNumbers.includes('ALL-BATCHES') ||
      (bNum.length > 0 && alert.batchNumbers.some((ab) => norm(ab) === bNum));

    if (batchMatch) {
      return {
        itemId: item.id,
        productName: item.brandName,
        batchNumber: item.batchNumber || 'Unspecified',
        manufacturer: item.manufacturer || 'Unspecified',
        tier: 'Confirmed',
        asOfDate: DATASET_AS_OF_DATE,
        alertId: alert.id,
        agency: alert.agency,
        kind: alert.kind ?? 'nsq',
        evidenceStatus: alert.evidenceStatus ?? 'verified_alert',
        locator: alert.locator,
        publishedDate: alert.date,
        reviewedAt: alert.reviewedAt,
        sha256: alert.sha256,
        verification: alert.verification,
        reason: alert.reason,
        sourceUrl: alert.sourceUrl,
        criteria: {
          productMatch: true,
          manufacturerMatch,
          batchMatch: true,
        },
        noticeValues: {
          productName: alert.productName,
          manufacturer: alert.manufacturer,
          batchNumber: alert.batchNumbers.join(', '),
        },
        evidenceTier: 'Verified',
      };
    }

    return {
      itemId: item.id,
      productName: item.brandName,
      batchNumber: item.batchNumber || 'Not entered',
      manufacturer: item.manufacturer || 'Unspecified',
      tier: 'Same product, different batch',
      asOfDate: DATASET_AS_OF_DATE,
      alertId: alert.id,
      agency: alert.agency,
      kind: alert.kind ?? 'nsq',
      evidenceStatus: alert.evidenceStatus ?? 'verified_alert',
      locator: alert.locator,
      publishedDate: alert.date,
      reviewedAt: alert.reviewedAt,
      sha256: alert.sha256,
      verification: alert.verification,
      reason: `${alert.reason} (Alerted batch: ${alert.batchNumbers.join(', ')})`,
      sourceUrl: alert.sourceUrl,
      criteria: {
        productMatch: true,
        manufacturerMatch,
        batchMatch: false,
      },
      noticeValues: {
        productName: alert.productName,
        manufacturer: alert.manufacturer,
        batchNumber: alert.batchNumbers.join(', '),
      },
      evidenceTier: 'Verified',
    };
  }

  return {
    itemId: item.id,
    productName: item.brandName,
    batchNumber: item.batchNumber || 'Not entered',
    manufacturer: item.manufacturer || 'Unspecified',
    tier: 'Not found',
    asOfDate: DATASET_AS_OF_DATE,
    criteria: {
      productMatch: false,
      manufacturerMatch: false,
      batchMatch: false,
    },
    evidenceTier: 'Verified',
  };
}

function matchesRagRecord(item: PrescriptionItem, rec: RagClinicalRecord): boolean {
  const brand = norm(item.brandName);
  const ings = item.activeIngredients.map(norm);
  const targetIng = norm(rec.active_ingredient);

  const ingHit = ings.some((ing) => ing === targetIng || ing.includes(targetIng) || targetIng.includes(ing));
  const brandHit = rec.brand_examples.some((b) => {
    const nb = norm(b);
    return brand.includes(nb) || nb.includes(brand);
  });
  const comboHit =
    rec.id === 'rag-cough-cold-unsafe' &&
    (ings.some((i) =>
      ['chlorpheniramine', 'phenylephrine', 'dextromethorphan', 'codeine', 'promethazine'].some((c) =>
        i.includes(c)
      )
    ) ||
      ['sinarest', 'wikoryl', 'ascoril', 'solvin', 't-minic'].some((b) => brand.includes(b)));

  return ingHit || brandHit || comboHit;
}

export function retrieveRagMatches(
  items: PrescriptionItem[],
  patientAge: number,
  patientWeightKg?: number
): RagRetrievedMatch[] {
  if (patientAge >= 18) return [];

  const matches: RagRetrievedMatch[] = [];
  const weightValid = typeof patientWeightKg === 'number' && patientWeightKg > 0;

  for (const item of items) {
    const candidates = RAG_CLINICAL_RECORDS.filter((r) => matchesRagRecord(item, r));
    if (candidates.length === 0) continue;

    const refRecord = candidates.find((r) => r.safety_status === 'REFERENCE') ?? candidates[0];
    const unsafeRecord = candidates.find((r) => r.safety_status !== 'REFERENCE');

    let calculatedWeightDoseRange: string | undefined;
    let exceedsWeightOrFreq = false;
    const issues: string[] = [];

    if (refRecord.mg_per_kg_min && refRecord.mg_per_kg_max && weightValid && patientWeightKg) {
      const isDailyBasis = refRecord.reference_dose.toLowerCase().includes('/day');
      const minVal = Math.round(refRecord.mg_per_kg_min * patientWeightKg * 10) / 10;
      const maxVal = Math.round(refRecord.mg_per_kg_max * patientWeightKg * 10) / 10;
      const maxDoses = refRecord.max_doses_per_day ?? 4;
      calculatedWeightDoseRange = isDailyBasis
        ? `${minVal}–${maxVal} mg/day (for ${patientWeightKg} kg; ${maxDoses} divided doses/24h)`
        : `${minVal}–${maxVal} mg/dose (for ${patientWeightKg} kg; max ${maxDoses} doses/24h)`;

      if (isDailyBasis) {
        const dailyTotal = item.totalDailyMg || item.strengthMg * Math.max(1, item.frequencyPerDay);
        if (dailyTotal > maxVal) {
          exceedsWeightOrFreq = true;
          issues.push(
            `Daily dose ${dailyTotal} mg/day exceeds weight-based ceiling ${maxVal} mg/day for ${patientWeightKg} kg.`
          );
        }
      } else if (item.strengthMg > maxVal) {
        exceedsWeightOrFreq = true;
        issues.push(
          `Single dose ${item.strengthMg} mg exceeds weight-based ceiling ${maxVal} mg/dose for ${patientWeightKg} kg.`
        );
      }
      if (item.frequencyPerDay > maxDoses) {
        exceedsWeightOrFreq = true;
        issues.push(
          `Frequency ${item.frequencyPerDay}x/day exceeds cited maximum ${maxDoses} doses/24h.`
        );
      }
    } else if (refRecord.requires_weight_check) {
      issues.push('Patient body weight (kg) not confirmed; pediatric dosing is weight-dependent.');
    }

    const ageMonths = patientAge * 12;
    const belowMinAgeMonths =
      typeof refRecord.min_age_months === 'number' && ageMonths < refRecord.min_age_months;

    if (belowMinAgeMonths && refRecord.min_age_months) {
      exceedsWeightOrFreq = true;
      issues.push(
        `Patient age (${Math.round(ageMonths * 10) / 10} months) is below minimum formulary age threshold (${refRecord.min_age_months} months).`
      );
    }

    const otherIngredients = items
      .filter((other) => other.id !== item.id)
      .flatMap((other) => [
        ...other.activeIngredients.map(norm),
        norm(other.brandName),
      ]);
    const combinedInteractions = Array.from(
      new Set([...(refRecord.interactions ?? []), ...(unsafeRecord?.interactions ?? [])])
    );
    const matchedInteractions = combinedInteractions.filter((intr) => {
      const nIntr = intr.toLowerCase();
      return otherIngredients.some((other) => other.length >= 3 && nIntr.includes(other));
    });
    if (matchedInteractions.length > 0) {
      issues.push(`Co-prescribed RAG interaction match: ${matchedInteractions.join('; ')}.`);
    }

    const primaryIng = norm(item.activeIngredients[0] || item.brandName);
    const isContraindicatedByAge =
      belowMinAgeMonths ||
      (primaryIng.includes('nimesulide') && patientAge < 12) ||
      primaryIng.includes('aspirin') ||
      (primaryIng.includes('metoclopramide') && patientAge <= 1) ||
      (primaryIng.includes('ibuprofen') && ageMonths < 3) ||
      (primaryIng.includes('cetirizine') && ageMonths < 24) ||
      (refRecord.id === 'rag-cough-cold-unsafe' && patientAge < 4);

    if (isContraindicatedByAge) {
      issues.unshift(`Age ${patientAge} yrs triggers pediatric contraindication/restriction.`);
    }

    const activeTrigger =
      isContraindicatedByAge ||
      exceedsWeightOrFreq ||
      matchedInteractions.length > 0 ||
      unsafeRecord?.safety_status === 'CONTRAINDICATED' ||
      unsafeRecord?.safety_status === 'RESTRICTED'
        ? unsafeRecord ?? refRecord
        : !weightValid || unsafeRecord
          ? unsafeRecord
          : undefined;

    const warningBannerTitle =
      isContraindicatedByAge || activeTrigger?.safety_status === 'CONTRAINDICATED'
        ? `DOSAGE SAFETY WARNING — PEDIATRIC CONTRAINDICATION (${refRecord.medicine_name})`
        : `DOSAGE SAFETY WARNING — PEDIATRIC VERIFICATION REQUIRED (${refRecord.medicine_name})`;

    const warningSummary =
      issues.length > 0
        ? `${issues.join(' ')} ${activeTrigger?.reason ?? refRecord.reason}`
        : activeTrigger?.reason ?? refRecord.reason;

    matches.push({
      itemId: item.id,
      brandName: item.brandName,
      matchedRecord: refRecord,
      triggeredUnsafeRecord: activeTrigger,
      calculatedWeightDoseRange,
      warningBannerTitle,
      warningSummary,
    });
  }

  return matches;
}

export function auditItemDosage(
  item: PrescriptionItem,
  patientAge: number,
  patientWeightKg?: number
): DosageAuditResult {
  const primaryIngredient = norm(item.activeIngredients[0] || item.brandName);
  const rule = DOSE_RULES.find(
    (r) => r.ingredient === primaryIngredient || primaryIngredient.includes(r.ingredient)
  );

  if (!rule) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: primaryIngredient,
      prescribedDailyMg: item.totalDailyMg,
      adultMaxDailyMg: 0,
      elderlyMaxDailyMg: 0,
      typicalRangeLabel: 'No curated ceiling rule in local monograph',
      status: 'Unlisted Ingredient',
      criterionNote: 'Requires pharmacist monograph confirmation.',
      source: 'MedGuard Curated Monograph Coverage',
      evidenceTier: 'Curated',
    };
  }

  const daily = item.totalDailyMg || item.strengthMg * Math.max(1, item.frequencyPerDay);
  const isElderly = patientAge >= 65;
  const isPediatric = patientAge >= 0 && patientAge < 18;

  if (isPediatric) {
    const ageMonths = patientAge * 12;
    const ragRef = RAG_CLINICAL_RECORDS.find(
      (r) => r.active_ingredient === rule.ingredient && r.safety_status === 'REFERENCE'
    );
    const belowMinAge =
      typeof ragRef?.min_age_months === 'number' && ageMonths < ragRef.min_age_months;

    const isContra =
      belowMinAge ||
      (rule.ingredient === 'nimesulide' && patientAge < 12) ||
      rule.ingredient === 'aspirin' ||
      (rule.ingredient === 'metoclopramide' && patientAge <= 1) ||
      (rule.ingredient === 'ibuprofen' && ageMonths < 3) ||
      (rule.ingredient === 'cetirizine' && ageMonths < 24) ||
      ((rule.ingredient === 'chlorpheniramine' || rule.ingredient === 'phenylephrine') &&
        patientAge < 4);

    const isDailyBasis = ragRef?.reference_dose.toLowerCase().includes('/day') ?? false;
    const weightNote =
      patientWeightKg && patientWeightKg > 0 && ragRef?.mg_per_kg_min && ragRef?.mg_per_kg_max
        ? ` Weight-based reference for ${patientWeightKg} kg: ${Math.round(ragRef.mg_per_kg_min * patientWeightKg)}–${Math.round(ragRef.mg_per_kg_max * patientWeightKg)} ${isDailyBasis ? 'mg/day' : 'mg/dose'} (max ${ragRef.max_doses_per_day ?? 4} doses/24h).`
        : '';

    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      prescribedDailyMg: daily,
      adultMaxDailyMg: rule.adultMaxDailyMg,
      elderlyMaxDailyMg: rule.elderlyMaxDailyMg,
      typicalRangeLabel: ragRef?.reference_dose ?? rule.typicalRangeLabel,
      status: isContra ? 'Pediatric Contraindication' : 'Pediatric Dose Review Required',
      criterionNote: isContra
        ? `Patient age ${patientAge} yrs (${Math.round(ageMonths)} mo): ${rule.ingredient} carries a pediatric age restriction or contraindication. Do not administer without specialist review.`
        : `Patient age ${patientAge} (<18): prescribed ${item.strengthMg} mg x ${item.frequencyPerDay}/day (${daily} mg/day) requires weight, formulation, and dosing-interval verification.${weightNote}`,
      source: ragRef?.source ?? rule.source,
      evidenceTier: 'Curated',
    };
  }

  if (daily > rule.adultMaxDailyMg) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      prescribedDailyMg: daily,
      adultMaxDailyMg: rule.adultMaxDailyMg,
      elderlyMaxDailyMg: rule.elderlyMaxDailyMg,
      typicalRangeLabel: rule.typicalRangeLabel,
      status: 'High / Overdose Risk',
      criterionNote: `Prescribed ${daily} mg/day exceeds adult maximum ${rule.adultMaxDailyMg} mg/day.`,
      source: rule.source,
      evidenceTier: 'Curated',
    };
  }

  if (isElderly && daily > rule.elderlyMaxDailyMg) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      prescribedDailyMg: daily,
      adultMaxDailyMg: rule.adultMaxDailyMg,
      elderlyMaxDailyMg: rule.elderlyMaxDailyMg,
      typicalRangeLabel: rule.typicalRangeLabel,
      status: 'Elderly Dose Exceeded',
      criterionNote: `Patient age ${patientAge} ≥ 65: prescribed ${daily} mg/day exceeds geriatric cap ${rule.elderlyMaxDailyMg} mg/day.`,
      source: rule.source,
      evidenceTier: 'Curated',
    };
  }

  if (daily > 0 && daily < rule.minDailyMg) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      prescribedDailyMg: daily,
      adultMaxDailyMg: rule.adultMaxDailyMg,
      elderlyMaxDailyMg: rule.elderlyMaxDailyMg,
      typicalRangeLabel: rule.typicalRangeLabel,
      status: 'Sub-therapeutic / Low',
      criterionNote: `Prescribed ${daily} mg/day is below typical minimum ${rule.minDailyMg} mg/day.`,
      source: rule.source,
      evidenceTier: 'Curated',
    };
  }

  return {
    itemId: item.id,
    brandName: item.brandName,
    ingredient: rule.ingredient,
    prescribedDailyMg: daily,
    adultMaxDailyMg: rule.adultMaxDailyMg,
    elderlyMaxDailyMg: rule.elderlyMaxDailyMg,
    typicalRangeLabel: rule.typicalRangeLabel,
    status: 'Appropriate',
    criterionNote: `${daily} mg/day is within cited ceiling for age ${patientAge} (${isElderly ? rule.elderlyMaxDailyMg : rule.adultMaxDailyMg} mg/day max).`,
    source: rule.source,
    evidenceTier: 'Curated',
  };
}

function expandConditionTerms(rawCond: string): string[] {
  const c = norm(rawCond);
  if (!c) return [];
  const terms = new Set<string>([c]);
  for (const [canonical, aliases] of Object.entries(CONDITION_SYNONYMS)) {
    if (c.includes(canonical) || aliases.some((a) => c.includes(a))) {
      terms.add(canonical);
      aliases.forEach((a) => terms.add(a));
    }
  }
  return Array.from(terms);
}

export function auditDiseaseMatch(
  item: PrescriptionItem,
  patientCondition: string
): DiseaseMatchAudit {
  const cond = norm(patientCondition);
  const primaryIngredient = norm(item.activeIngredients[0] || item.brandName);
  const rule = INDICATION_RULES.find(
    (r) => r.ingredient === primaryIngredient || primaryIngredient.includes(r.ingredient)
  );

  if (!cond) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: primaryIngredient,
      patientCondition: 'Not specified',
      expectedIndications: rule?.indications ?? [],
      status: 'Condition Not Specified',
      criterionNote: 'Enter the diagnosed disease or symptom to audit indication match.',
      source: rule?.source ?? 'MedGuard Indication Catalog',
      evidenceTier: 'Curated',
    };
  }

  if (!rule) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: primaryIngredient,
      patientCondition,
      expectedIndications: [],
      status: 'Indication Mismatch',
      criterionNote: 'Ingredient indication not listed in curated catalog; confirm with prescriber.',
      source: 'MedGuard Indication Catalog',
      evidenceTier: 'Curated',
    };
  }

  const expandedTerms = expandConditionTerms(cond);
  const directMatch = rule.indications.some((ind) =>
    expandedTerms.some((term) => term.includes(ind) || ind.includes(term))
  );

  const symptomOnly =
    rule.symptomReliefOnlyFor?.some((ind) =>
      expandedTerms.some((term) => term.includes(ind) || ind.includes(term))
    ) ?? false;

  if (symptomOnly && !directMatch) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      patientCondition,
      expectedIndications: rule.indications,
      status: 'Symptom Relief Only',
      criterionNote: `Treats fever/pain symptoms only; does not treat the underlying ${patientCondition}.`,
      source: rule.source,
      evidenceTier: 'Curated',
    };
  }

  if (directMatch) {
    return {
      itemId: item.id,
      brandName: item.brandName,
      ingredient: rule.ingredient,
      patientCondition,
      expectedIndications: rule.indications,
      status: 'Matches Condition',
      criterionNote: `Labeled indication matches "${patientCondition}".`,
      source: rule.source,
      evidenceTier: 'Curated',
    };
  }

  return {
    itemId: item.id,
    brandName: item.brandName,
    ingredient: rule.ingredient,
    patientCondition,
    expectedIndications: rule.indications,
    status: 'Indication Mismatch',
    criterionNote: `"${rule.ingredient}" is typically indicated for ${rule.indications.slice(0, 3).join(', ')}, NOT "${patientCondition}". Verify whether another condition is being treated.`,
    source: rule.source,
    evidenceTier: 'Curated',
  };
}

function itemMatchesKeywords(item: PrescriptionItem, keywords: string[]): boolean {
  const brand = norm(item.brandName);
  const ings = item.activeIngredients.map(norm);
  return keywords.some((kw) => {
    const k = norm(kw);
    return (
      k.length >= 3 &&
      (brand.includes(k) || ings.some((ing) => ing.includes(k) || k.includes(ing)))
    );
  });
}

export function evaluateQuizRisks(
  items: PrescriptionItem[],
  quizProfile?: PatientHealthQuiz
): QuizRiskFinding[] {
  if (!quizProfile) return [];
  const findings: QuizRiskFinding[] = [];
  const seenIds = new Set<string>();
  const addFinding = (f: QuizRiskFinding) => {
    if (seenIds.has(f.id)) return;
    seenIds.add(f.id);
    findings.push(f);
  };

  // 1. Drug Allergies & Cross-Reactivity (Fatal Anaphylaxis / Hypersensitivity)
  for (const allergyId of quizProfile.allergies ?? []) {
    const meta = DRUG_ALLERGY_OPTIONS.find((a) => a.id === allergyId);
    if (!meta) continue;
    const matchedItems = items.filter((item) =>
      itemMatchesKeywords(item, meta.matchedIngredients)
    );
    if (matchedItems.length > 0) {
      addFinding({
        id: `quiz-allergy-${allergyId}`,
        category: 'Drug Allergy / Anaphylaxis',
        severity: 'Fatal Risk',
        title: `ALLERGY MATCH — ${meta.label.en}`,
        drugsInvolved: matchedItems.map((i) => i.brandName),
        matchedQuizFactor: meta.label.en,
        clinicalSummary: `Patient safety quiz reported "${meta.label.en}". ${meta.fatalWarningHint.en}`,
        recommendedAction: `DO NOT TAKE ${matchedItems.map((i) => i.brandName).join(', ')}. Contact your prescriber immediately for a non-cross-reactive alternative.`,
        source: meta.source,
        mechanismTargetId: meta.mechanismTargetId,
      });
    }
  }

  // Custom user-typed allergies & current blood-thinner / drug notes
  const customTokens = (quizProfile.customAllergies || '')
    .split(/[,;\n/]+/)
    .map((t) => norm(t))
    .filter((t) => t.length >= 3);
  for (const token of customTokens) {
    const matchedItems = items.filter((item) => itemMatchesKeywords(item, [token]));
    if (matchedItems.length > 0) {
      addFinding({
        id: `quiz-custom-allergy-${token}`,
        category: 'Drug Allergy / Anaphylaxis',
        severity: 'Fatal Risk',
        title: `CUSTOM ALLERGY MATCH — "${token}"`,
        drugsInvolved: matchedItems.map((i) => i.brandName),
        matchedQuizFactor: `Reported Allergy: ${token}`,
        clinicalSummary: `Your health quiz lists "${token}" as an allergy/intolerance, which matches ${matchedItems.map((i) => i.brandName).join(', ')}. Re-exposure risks fatal anaphylaxis or organ injury.`,
        recommendedAction: `Hold ${matchedItems.map((i) => i.brandName).join(', ')} and request an urgent substitute from your doctor.`,
        source: 'Patient Health Safety Quiz Allergy Screen',
      });
    }
  }

  // 2. Recent / Upcoming Surgery & Active Bleeding Screening
  if (quizProfile.surgeryStatus && quizProfile.surgeryStatus !== 'none') {
    const surgMeta = SURGICAL_STATUS_OPTIONS.find((s) => s.id === quizProfile.surgeryStatus);
    const surgLabel = surgMeta?.label.en ?? quizProfile.surgeryStatus;
    const surgNote = quizProfile.surgeryDetails?.trim()
      ? ` (${quizProfile.surgeryDetails.trim()})`
      : '';

    const nsaidOrAntiplateletItems = items.filter((item) =>
      itemMatchesKeywords(item, [
        'ibuprofen',
        'diclofenac',
        'nimesulide',
        'etodolac',
        'aspirin',
        'naproxen',
        'ketorolac',
        'aceclofenac',
        'clopidogrel',
      ])
    );
    if (nsaidOrAntiplateletItems.length > 0) {
      addFinding({
        id: `quiz-surgery-bleed-${quizProfile.surgeryStatus}`,
        category: 'Recent Surgery / Bleeding Risk',
        severity: 'Fatal Risk',
        title: `SURGICAL HEMORRHAGE RISK — NSAID / Antiplatelet Alongside ${surgLabel}`,
        drugsInvolved: nsaidOrAntiplateletItems.map((i) => i.brandName),
        matchedQuizFactor: `${surgLabel}${surgNote}`,
        clinicalSummary: `Patient quiz flagged "${surgLabel}${surgNote}". COX-1/COX-2 inhibition and platelet dysfunction from ${nsaidOrAntiplateletItems.map((i) => i.brandName).join(', ')} can cause severe post-operative bleeding, anastomotic leak, or fatal internal hemorrhage.`,
        recommendedAction:
          'Confirm directly with your surgeon before taking any NSAID, aspirin, or blood-thinning medicine around surgery.',
        source: 'Perioperative Medication Safety Guidelines (ASA / NICE NG180)',
        mechanismTargetId: 'COX2',
      });
    }

    const metforminItems = items.filter((item) => itemMatchesKeywords(item, ['metformin']));
    if (metforminItems.length > 0) {
      addFinding({
        id: `quiz-surgery-metformin-${quizProfile.surgeryStatus}`,
        category: 'Recent Surgery / Bleeding Risk',
        severity: 'Critical',
        title: `PERIOPERATIVE LACTIC ACIDOSIS HOLD — Metformin (${surgLabel})`,
        drugsInvolved: metforminItems.map((i) => i.brandName),
        matchedQuizFactor: `${surgLabel}${surgNote}`,
        clinicalSummary: `Around recent or upcoming surgery${surgNote} (NPO fasting, anesthesia, contrast dyes, or hemodynamic stress), Metformin carries a serious risk of fatal Metformin-Associated Lactic Acidosis (MALA) via AMPK/mitochondrial complex I inhibition.`,
        recommendedAction:
          'Ask your surgeon/anesthesiologist whether Metformin must be temporarily held 24–48 hours around surgery and until kidney perfusion & oral intake stabilize.',
        source: 'FDA Metformin Boxed Warning (Surgery / Contrast / Hypoxia) · ADA Standards',
        mechanismTargetId: 'AMPK',
      });
    }
  }

  // 3. Fatal-End Organ & Systemic Health Factors
  const factors = quizProfile.fatalRiskFactors ?? [];
  const factorMeta = (id: string) => FATAL_RISK_FACTOR_OPTIONS.find((f) => f.id === id);

  // 3a. Severe Liver Disease or Chronic Alcohol -> Paracetamol, Nimesulide, Statins
  if (factors.includes('severe_liver_disease') || factors.includes('chronic_alcohol_use')) {
    const isAlcoholOnly =
      !factors.includes('severe_liver_disease') && factors.includes('chronic_alcohol_use');
    const factorTitle = factors.includes('severe_liver_disease')
      ? factorMeta('severe_liver_disease')!.label.en
      : factorMeta('chronic_alcohol_use')!.label.en;

    const paracetamolItems = items.filter((item) => itemMatchesKeywords(item, ['paracetamol', 'acetaminophen']));
    for (const pItem of paracetamolItems) {
      const dailyMg = pItem.totalDailyMg || pItem.strengthMg * Math.max(1, pItem.frequencyPerDay);
      if (factors.includes('severe_liver_disease') || dailyMg > 2000) {
        addFinding({
          id: `quiz-liver-pcm-${pItem.id}`,
          category: 'Fatal Organ / Systemic Risk',
          severity: dailyMg > 2000 || factors.includes('severe_liver_disease') ? 'Fatal Risk' : 'Critical',
          title: `HEPATOTOXICITY / FULMINANT LIVER FAILURE RISK — ${pItem.brandName}`,
          drugsInvolved: [pItem.brandName],
          matchedQuizFactor: factorTitle,
          clinicalSummary: isAlcoholOnly
            ? `With regular alcohol use, hepatic glutathione is depleted; ${pItem.brandName} at ${dailyMg} mg/day exceeds the 2,000 mg/day alcohol-adjusted hepatic ceiling and can cause fatal liver necrosis.`
            : `In severe liver disease/cirrhosis, glutathione stores and hepatic clearance of Paracetamol (${dailyMg} mg/day) are severely impaired, risking fatal acute liver failure.`,
          recommendedAction:
            'Do not exceed clinician-approved reduced dosing (strictly ≤ 2,000 mg/day or avoid in decompensated cirrhosis). Seek urgent care for nausea, right upper abdominal pain, or jaundice.',
          source: 'FDA Acetaminophen Hepatotoxicity Warning / ACG Liver Guidelines',
          mechanismTargetId: 'CYP3A4',
        });
      }
    }

    const nimesulideItems = items.filter((item) => itemMatchesKeywords(item, ['nimesulide']));
    if (nimesulideItems.length > 0) {
      addFinding({
        id: 'quiz-liver-nimesulide',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `FULMINANT HEPATIC NECROSIS CONTRAINDICATION — Nimesulide`,
        drugsInvolved: nimesulideItems.map((i) => i.brandName),
        matchedQuizFactor: factorTitle,
        clinicalSummary: `Nimesulide carries a documented black-box risk of idiosyncratic fulminant hepatic failure and is strictly contraindicated with liver disease or alcohol exposure.`,
        recommendedAction: 'STOP Nimesulide immediately and ask your prescriber for a non-hepatotoxic option.',
        source: 'CDSCO / EMA Nimesulide Hepatotoxicity Restriction',
        mechanismTargetId: 'COX2',
      });
    }

    const statinItems = items.filter((item) =>
      itemMatchesKeywords(item, ['atorvastatin', 'simvastatin', 'rosuvastatin'])
    );
    if (statinItems.length > 0 && factors.includes('severe_liver_disease')) {
      addFinding({
        id: 'quiz-liver-statin',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `ACTIVE LIVER DISEASE CONTRAINDICATION — Statin Therapy`,
        drugsInvolved: statinItems.map((i) => i.brandName),
        matchedQuizFactor: factorTitle,
        clinicalSummary: `Statins undergo extensive hepatic CYP3A4 metabolism and are contraindicated in active liver disease or unexplained persistent transaminase elevation.`,
        recommendedAction: 'Hold statin until liver enzymes (ALT/AST/bilirubin) are reviewed by your doctor.',
        source: 'FDA Statin Prescribing Information (Active Hepatic Disease Contraindication)',
        mechanismTargetId: 'CYP3A4',
      });
    }
  }

  // 3b. Severe Kidney Failure / CKD -> Metformin, NSAIDs, Telmisartan
  if (factors.includes('severe_kidney_ckd') || factors.includes('dehydration_or_sepsis')) {
    const isDehydrationOnly =
      !factors.includes('severe_kidney_ckd') && factors.includes('dehydration_or_sepsis');
    const factorLabel = factors.includes('severe_kidney_ckd')
      ? factorMeta('severe_kidney_ckd')!.label.en
      : factorMeta('dehydration_or_sepsis')!.label.en;

    const metforminItems = items.filter((item) => itemMatchesKeywords(item, ['metformin']));
    if (metforminItems.length > 0) {
      addFinding({
        id: 'quiz-renal-metformin',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `FATAL LACTIC ACIDOSIS (MALA) RISK — Metformin`,
        drugsInvolved: metforminItems.map((i) => i.brandName),
        matchedQuizFactor: factorLabel,
        clinicalSummary: isDehydrationOnly
          ? `Severe dehydration/sepsis drops kidney filtration rapidly, causing Metformin accumulation and life-threatening lactic acidosis.`
          : `Metformin is contraindicated in severe renal impairment (eGFR < 30 mL/min/1.73m²) because renal failure triggers fatal Metformin-Associated Lactic Acidosis (MALA).`,
        recommendedAction:
          'Hold Metformin and verify latest serum creatinine / eGFR with your doctor before taking another dose.',
        source: 'FDA Metformin Boxed Warning (Renal Impairment / MALA) · ADA Standards',
        mechanismTargetId: 'AMPK',
      });
    }

    const nsaidItems = items.filter((item) =>
      itemMatchesKeywords(item, ['ibuprofen', 'diclofenac', 'nimesulide', 'etodolac', 'aspirin', 'naproxen'])
    );
    if (nsaidItems.length > 0) {
      addFinding({
        id: 'quiz-renal-nsaid',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `ACUTE KIDNEY SHUTDOWN / HEMORRHAGE RISK — NSAID`,
        drugsInvolved: nsaidItems.map((i) => i.brandName),
        matchedQuizFactor: factorLabel,
        clinicalSummary: isDehydrationOnly
          ? `In severe dehydration or suspected dengue, NSAIDs constrict renal blood flow causing acute kidney injury AND worsen fatal hemorrhagic bleeding.`
          : `In CKD/dialysis, NSAIDs block renal vasodilatory prostaglandins via COX-2/COX-1, precipitating acute-on-chronic kidney failure and hyperkalemia.`,
        recommendedAction: 'Avoid NSAIDs completely and consult your physician for a kidney-safe analgesic.',
        source: 'KDIGO CKD Guideline / WHO Dengue & Dehydration Safety Advisory',
        mechanismTargetId: 'COX2',
      });
    }
  }

  // 3c. Cardiac Arrhythmia / Long QT -> Azithromycin, Clarithromycin, Domperidone, Ciprofloxacin
  if (factors.includes('cardiac_qt_or_arrhythmia')) {
    const qtItems = items.filter((item) =>
      itemMatchesKeywords(item, ['azithromycin', 'clarithromycin', 'domperidone', 'ciprofloxacin', 'levofloxacin'])
    );
    if (qtItems.length > 0) {
      addFinding({
        id: 'quiz-cardiac-qt',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `FATAL TORSADES DE POINTES / hERG QT PROLONGATION RISK`,
        drugsInvolved: qtItems.map((i) => i.brandName),
        matchedQuizFactor: factorMeta('cardiac_qt_or_arrhythmia')!.label.en,
        clinicalSummary: `With pre-existing heart rhythm / Long QT / heart failure history, ${qtItems.map((i) => i.brandName).join(', ')} block cardiac hERG (Kv11.1) potassium channels and can trigger fatal ventricular arrhythmia (Torsades de Pointes).`,
        recommendedAction:
          'Do NOT take until cleared by your cardiologist/prescriber with a baseline ECG and serum K+/Mg2+ check.',
        source: 'CredibleMeds® QT Drug Registry / FDA Cardiac Arrhythmia Warning',
        mechanismTargetId: 'HERG',
      });
    }
  }

  // 3d. GI Ulcer or Blood Thinners (from checkbox OR typed current meds note) -> NSAIDs / Aspirin
  const typedBloodThinner = /\b(warfarin|clopidogrel|apixaban|rivaroxaban|dabigatran|heparin|enoxaparin|ecosprin)\b/i.test(
    quizProfile.currentMedicationsNote || ''
  );
  if (
    factors.includes('gi_ulcer_or_bleed') ||
    factors.includes('anticoagulant_therapy') ||
    typedBloodThinner
  ) {
    const nsaidItems = items.filter((item) =>
      itemMatchesKeywords(item, ['ibuprofen', 'diclofenac', 'nimesulide', 'etodolac', 'aspirin', 'naproxen'])
    );
    if (nsaidItems.length > 0) {
      const matchedLabel = factors.includes('gi_ulcer_or_bleed')
        ? factorMeta('gi_ulcer_or_bleed')!.label.en
        : factors.includes('anticoagulant_therapy')
          ? factorMeta('anticoagulant_therapy')!.label.en
          : `Blood thinner noted (${quizProfile.currentMedicationsNote})`;
      addFinding({
        id: 'quiz-gi-bleed-nsaid',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `LIFE-THREATENING GI / INTERNAL BLEED RISK — NSAID + Ulcer / Anticoagulant`,
        drugsInvolved: nsaidItems.map((i) => i.brandName),
        matchedQuizFactor: matchedLabel,
        clinicalSummary: `NSAIDs erode protective gastric prostaglandins (COX-1/COX-2) and impair platelet clotting, multiplying the risk of fatal gastrointestinal hemorrhage or perforation.`,
        recommendedAction:
          'Avoid unmonitored NSAID use and consult your physician immediately regarding stomach-safe alternatives or gastroprotection.',
        source: 'FDA Black-Box GI Bleeding Warning for NSAIDs / NICE NG5',
        mechanismTargetId: 'COX2',
      });
    }
  }

  // 3e. Asthma / NSAID Triad -> NSAIDs / Aspirin
  if (factors.includes('asthma_or_nsaid_triad')) {
    const nsaidItems = items.filter((item) =>
      itemMatchesKeywords(item, ['ibuprofen', 'diclofenac', 'nimesulide', 'etodolac', 'aspirin', 'naproxen'])
    );
    if (nsaidItems.length > 0) {
      addFinding({
        id: 'quiz-asthma-nsaid',
        category: 'Fatal Organ / Systemic Risk',
        severity: 'Fatal Risk',
        title: `FATAL BRONCHOSPASM RISK — NSAID-Exacerbated Asthma (AERD)`,
        drugsInvolved: nsaidItems.map((i) => i.brandName),
        matchedQuizFactor: factorMeta('asthma_or_nsaid_triad')!.label.en,
        clinicalSummary: `In severe asthma or aspirin-sensitive respiratory disease, COX-1/COX-2 NSAIDs shunt arachidonic acid toward leukotrienes, triggering acute life-threatening bronchospasm.`,
        recommendedAction:
          'Do not take this NSAID without prior tolerability confirmation from your asthma specialist.',
        source: 'GINA Asthma Guideline / FDA NSAID Bronchospasm Contraindication',
        mechanismTargetId: 'COX2',
      });
    }
  }

  // 3f. Pregnancy / Breastfeeding -> Statins, NSAIDs, ARBs (Telmisartan), Fluoroquinolones
  if (factors.includes('pregnancy_or_breastfeeding')) {
    const pregContraItems = items.filter((item) =>
      itemMatchesKeywords(item, [
        'atorvastatin',
        'simvastatin',
        'rosuvastatin',
        'telmisartan',
        'losartan',
        'ibuprofen',
        'diclofenac',
        'nimesulide',
        'etodolac',
        'ciprofloxacin',
      ])
    );
    if (pregContraItems.length > 0) {
      addFinding({
        id: 'quiz-pregnancy-teratogen',
        category: 'Pregnancy / Teratogenic Risk',
        severity: 'Fatal Risk',
        title: `PREGNANCY / LACTATION CONTRAINDICATION — Fetal Toxicity Risk`,
        drugsInvolved: pregContraItems.map((i) => i.brandName),
        matchedQuizFactor: factorMeta('pregnancy_or_breastfeeding')!.label.en,
        clinicalSummary: `Medicines such as ARBs (Telmisartan), Statins, Fluoroquinolones, and NSAIDs carry major pregnancy/lactation warnings including fetal renal toxicity, premature ductus arteriosus closure, or developmental harm.`,
        recommendedAction:
          'Hold non-cleared medicines and contact your obstetrician immediately before taking any dose.',
        source: 'FDA Pregnancy & Lactation Labeling Rule (PLLR) / WHO Formulary',
        mechanismTargetId: pregContraItems.some((i) =>
          itemMatchesKeywords(i, ['atorvastatin', 'simvastatin'])
        )
          ? 'CYP3A4'
          : 'COX2',
      });
    }
  }

  return findings;
}

export function verifyPrescription(
  items: PrescriptionItem[],
  patientCondition: string,
  patientAge: number,
  patientWeightKg?: number,
  quizProfile?: PatientHealthQuiz
): VerificationReport {
  const effectiveWeight =
    patientWeightKg && patientWeightKg > 0
      ? patientWeightKg
      : quizProfile?.patientWeightKg && quizProfile.patientWeightKg > 0
        ? quizProfile.patientWeightKg
        : undefined;
  const packChecks = items.map((item) => verifyPackItem(item));
  const dosageAudits = items.map((item) => auditItemDosage(item, patientAge, effectiveWeight));
  const diseaseAudits = items.map((item) => auditDiseaseMatch(item, patientCondition));
  const ragMatches = retrieveRagMatches(items, patientAge, effectiveWeight);
  const quizRiskFindings = evaluateQuizRisks(items, quizProfile);
  const regimenFindings: RegimenFinding[] = [];

  // 1. Drug-Drug Interactions (pairwise)
  const allIngredients = items.flatMap((i) => i.activeIngredients.map(norm));
  for (const rule of INTERACTION_RULES) {
    const [a, b] = rule.ingredients;
    if (
      allIngredients.some((x) => x.includes(a)) &&
      allIngredients.some((x) => x.includes(b))
    ) {
      regimenFindings.push({
        id: rule.id,
        category: 'Drug-Drug Interaction',
        severity: rule.severity,
        title: rule.title,
        drugsInvolved: [a, b],
        evidenceTier: 'Curated',
        source: rule.source,
        criterionMatch: rule.criterionMatch,
        clinicalSummary: rule.clinicalSummary,
        mechanismTargetId: rule.mechanismTargetId,
      });
    }
  }

  // 2. Duplicate Active Ingredients across packs
  const ingCounts = new Map<string, string[]>();
  for (const item of items) {
    for (const ing of item.activeIngredients) {
      const key = norm(ing);
      const list = ingCounts.get(key) ?? [];
      list.push(item.brandName);
      ingCounts.set(key, list);
    }
  }
  for (const [ing, brands] of ingCounts.entries()) {
    if (brands.length > 1) {
      regimenFindings.push({
        id: `dup-${ing}`,
        category: 'Duplicate Ingredient',
        severity: 'Critical',
        title: `Duplicate Active Ingredient: ${ing}`,
        drugsInvolved: brands,
        evidenceTier: 'Curated',
        source: 'MedGuard Therapeutic Duplication Screen',
        criterionMatch: `${ing} present in ${brands.length} separate medicines (${brands.join(' + ')})`,
        clinicalSummary: `Taking multiple products containing ${ing} increases cumulative organ toxicity and overdose risk.`,
        mechanismTargetId: ing.includes('paracetamol') ? 'COX2' : 'CYP3A4',
      });
    }
  }

  // 3. Elderly Risk (Beers Criteria)
  if (patientAge >= 65) {
    for (const rule of ELDERLY_RISK_RULES) {
      if (allIngredients.some((x) => x.includes(rule.ingredient))) {
        regimenFindings.push({
          id: `beers-${rule.ingredient}`,
          category: 'Elderly Risk (Beers)',
          severity: rule.severity,
          title: rule.title,
          drugsInvolved: [rule.ingredient],
          evidenceTier: 'Curated',
          source: rule.source,
          criterionMatch: `Patient age ${patientAge} ≥ ${rule.minAge} + high-risk geriatric ingredient`,
          clinicalSummary: rule.clinicalSummary,
          mechanismTargetId: rule.ingredient === 'ibuprofen' ? 'COX2' : 'CYP2D6',
        });
      }
    }
  }

  // 4. Banned / Restricted FDC Combinations (Verified Gazette)
  for (const ban of BANNED_FDC_RULES) {
    const matchedInItem = items.find((item) =>
      ban.ingredients.every((bi) => ingredientMatches(item.activeIngredients, bi))
    );
    const matchedAcross = ban.ingredients.every((bi) =>
      allIngredients.some((ai) => ai.includes(bi))
    );
    if (matchedInItem || matchedAcross) {
      regimenFindings.push({
        id: ban.id,
        category: 'Banned / Restricted FDC',
        severity: 'Critical',
        title: ban.title,
        drugsInvolved: ban.ingredients,
        evidenceTier: 'Verified',
        source: ban.source,
        criterionMatch: `All prohibited FDC ingredients matched: ${ban.ingredients.join(' + ')}`,
        clinicalSummary: ban.clinicalSummary,
        mechanismTargetId: 'COX2',
      });
    }
  }

  // 5. Pediatric Regulatory & Formularies Restrictions (from RAG dataset)
  if (patientAge >= 0 && patientAge < 18) {
    for (const match of ragMatches) {
      const unsafe = match.triggeredUnsafeRecord;
      if (unsafe && (unsafe.safety_status === 'CONTRAINDICATED' || unsafe.safety_status === 'RESTRICTED')) {
        regimenFindings.push({
          id: `ped-rag-${match.itemId}`,
          category: 'Pediatric Contraindication',
          severity: unsafe.safety_status === 'CONTRAINDICATED' ? 'Critical' : 'Moderate',
          title: `${unsafe.medicine_name}: Pediatric Safety Restriction (${unsafe.age_range})`,
          drugsInvolved: [unsafe.active_ingredient],
          evidenceTier: unsafe.evidence_level,
          source: unsafe.source,
          criterionMatch: `Patient age ${patientAge} yrs · ${unsafe.scenario ?? unsafe.reason}`,
          clinicalSummary: unsafe.reason,
          mechanismTargetId: unsafe.mechanism_target_id,
        });
      }
    }
  }

  const packAlerts = packChecks.filter((p) => p.tier !== 'Not found').length;
  const dosageIssues = dosageAudits.filter((d) => d.status !== 'Appropriate').length;
  const diseaseMismatches = diseaseAudits.filter(
    (d) => d.status !== 'Matches Condition'
  ).length;
  const ragFlags = ragMatches.filter((m) => Boolean(m.triggeredUnsafeRecord)).length;
  const quizFatalOrCritical = quizRiskFindings.filter(
    (q) => q.severity === 'Fatal Risk' || q.severity === 'Critical'
  ).length;
  const quizRiskFlags = quizRiskFindings.length;
  const criticalFindings = regimenFindings.filter((f) => f.severity === 'Critical').length;
  const hasConfirmedPackAlert = packChecks.some((p) => p.tier === 'Confirmed');

  let overallVerdict: OverallVerdictStatus = 'SAFE_TO_TAKE';
  let verdictHeadline = 'Safe to Consume — Verified Within Rules';
  let verdictQualifier =
    quizProfile?.completed
      ? `Every extracted medicine matches "${patientCondition}", clears your Patient Health & Fatal-Risk Quiz (allergies, surgery & organ profile), and falls within age-specific (${patientAge} yrs) dosage ceilings as of ${DATASET_AS_OF_DATE}.`
      : `Every extracted medicine matches "${patientCondition}" and falls within age-specific (${patientAge} yrs) dosage ceilings with zero regulator alerts or clashes as of ${DATASET_AS_OF_DATE}.`;

  if (
    items.length === 0 ||
    hasConfirmedPackAlert ||
    criticalFindings > 0 ||
    quizFatalOrCritical > 0 ||
    dosageAudits.some(
      (d) => d.status === 'High / Overdose Risk' || d.status === 'Pediatric Contraindication'
    )
  ) {
    overallVerdict = 'ACTION_REQUIRED';
    verdictHeadline =
      quizFatalOrCritical > 0
        ? 'FATAL / CRITICAL RISK DETECTED — Patient Health Quiz Contraindication'
        : 'Action Required — Safety Issue Detected';
    verdictQualifier =
      quizFatalOrCritical > 0
        ? `Combined Patient Safety Quiz & Scanner flagged ${quizFatalOrCritical} life-threatening allergy, recent surgery, or organ-risk conflict(s): ${quizRiskFindings[0]?.title}. Show this combined audit to your prescribing doctor, surgeon, or pharmacist immediately before taking any dose.`
        : 'Do not stop or alter prescribed medicines on your own; show this audit report to your prescribing doctor or pharmacist immediately.';
  } else if (
    packAlerts > 0 ||
    dosageIssues > 0 ||
    diseaseMismatches > 0 ||
    regimenFindings.length > 0 ||
    ragFlags > 0 ||
    quizRiskFlags > 0
  ) {
    overallVerdict = 'CAUTION_REVIEW';
    verdictHeadline = 'Caution — Review Required Before Consuming';
    verdictQualifier =
      patientAge < 18
        ? 'Pediatric regimen requires weight (kg), formulation strength, dose per administration, and dosing-interval verification against CDSCO / IAP / WHO references.'
        : 'One or more medicines could not be fully matched against your stated disease, patient health quiz, dosage limits, or batch records. Confirm with your doctor or pharmacist.';
  }

  // Pick most relevant cellular mechanism target for AlphaFold Mechanism Lens
  let primaryMechanismId: MechanismTargetId = 'AMPK';
  const quizWithTarget = quizRiskFindings.find((q) => q.mechanismTargetId);
  const findingWithTarget = regimenFindings.find((f) => f.mechanismTargetId);
  if (quizWithTarget?.mechanismTargetId) {
    primaryMechanismId = quizWithTarget.mechanismTargetId;
  } else if (findingWithTarget?.mechanismTargetId) {
    primaryMechanismId = findingWithTarget.mechanismTargetId;
  } else if (ragMatches[0]?.matchedRecord.mechanism_target_id) {
    primaryMechanismId = ragMatches[0].matchedRecord.mechanism_target_id;
  } else if (allIngredients.some((i) => i.includes('atorvastatin') || i.includes('simvastatin') || i.includes('clarithromycin'))) {
    primaryMechanismId = 'CYP3A4';
  } else if (allIngredients.some((i) => i.includes('ibuprofen') || i.includes('paracetamol') || i.includes('etodolac'))) {
    primaryMechanismId = 'COX2';
  } else if (allIngredients.some((i) => i.includes('domperidone') || i.includes('azithromycin'))) {
    primaryMechanismId = 'HERG';
  }

  // Build deduplicated external validation sources grounded in FDA DailyMed, RCSB PDB, Mol* AlphaFold DB, and CDSCO/WHO
  const sourceMap = new Map<string, ExternalValidationSource>();
  const addSource = (src: ExternalValidationSource) => {
    if (!sourceMap.has(src.url)) {
      sourceMap.set(src.url, src);
    }
  };

  for (const ing of allIngredients) {
    const direct = INGREDIENT_REFERENCE_LINKS[ing];
    if (direct) {
      addSource({
        id: `ing-${ing}`,
        title: direct.title,
        category: direct.category,
        url: direct.url,
        relevance: direct.relevance,
      });
    } else {
      const matchedKey = Object.keys(INGREDIENT_REFERENCE_LINKS).find((k) => ing.includes(k));
      if (matchedKey) {
        const ref = INGREDIENT_REFERENCE_LINKS[matchedKey];
        addSource({
          id: `ing-${matchedKey}`,
          title: ref.title,
          category: ref.category,
          url: ref.url,
          relevance: ref.relevance,
        });
      }
    }
  }

  for (const p of packChecks) {
    if (p.tier !== 'Not found' && p.sourceUrl) {
      addSource({
        id: `pack-${p.alertId || p.itemId}`,
        title: `${p.agency} Alert ${p.alertId}: ${p.productName}`,
        category: 'Regulatory / Formulary',
        url: p.sourceUrl,
        relevance: p.reason || 'Official regulator batch/recall notice.',
      });
    }
  }

  for (const m of ragMatches) {
    const rec = m.triggeredUnsafeRecord ?? m.matchedRecord;
    addSource({
      id: `rag-${rec.id}`,
      title: `${rec.source} (${rec.medicine_name})`,
      category: 'Regulatory / Formulary',
      url: rec.source_url,
      relevance: rec.reference_dose,
    });
  }

  const mechTarget = MECHANISM_TARGETS[primaryMechanismId];
  addSource({
    id: `pdb-${mechTarget.id}`,
    title: `RCSB PDB Structure: ${mechTarget.structureId.split('·')[0].trim()} (${mechTarget.name})`,
    category: 'RCSB PDB Structure',
    url: mechTarget.rcsbStructureUrl,
    relevance: `${mechTarget.resolutionOrConfidence} — experimental active-site structure.`,
  });
  addSource({
    id: `afdb-${mechTarget.id}`,
    title: `Mol* AlphaFold DB 3D Viewer: ${mechTarget.gene}`,
    category: 'Mol* AlphaFold DB',
    url: mechTarget.alphafoldViewerUrl,
    relevance: `Full-length AlphaFold structural context inside ${mechTarget.cellularOrganelle}.`,
  });
  if (mechTarget.dailymedUrl && mechTarget.dailymedLabel) {
    addSource({
      id: `dailymed-${mechTarget.id}`,
      title: mechTarget.dailymedLabel,
      category: 'FDA DailyMed Label',
      url: mechTarget.dailymedUrl,
      relevance: `Official FDA labeling & drug interaction reference linked to ${mechTarget.id}.`,
    });
  }

  const validationSources = Array.from(sourceMap.values());
  const citedTitles = validationSources.map((s) => s.title).slice(0, 4).join('; ');
  if (citedTitles) {
    verdictQualifier = `${verdictQualifier} Sources cited: ${citedTitles}.`;
  }

  let checksRan = 1; // Regimen screen always runs within its loaded rules
  let checksNotRun = 0;
  for (const d of dosageAudits) {
    if (d.status === 'Unlisted Ingredient') checksNotRun += 1;
    else checksRan += 1;
  }
  for (const dis of diseaseAudits) {
    if (
      dis.status === 'Condition Not Specified' ||
      dis.criterionNote.includes('not listed in curated catalog')
    ) {
      checksNotRun += 1;
    } else {
      checksRan += 1;
    }
  }
  checksRan += packChecks.length;
  if (quizProfile?.completed) {
    checksRan += items.length;
  } else {
    checksNotRun += 1;
  }

  return {
    overallVerdict,
    verdictHeadline,
    verdictQualifier,
    asOfDate: DATASET_AS_OF_DATE,
    patientCondition: patientCondition || 'Unspecified',
    patientAge,
    patientWeightKg: effectiveWeight,
    packChecks,
    dosageAudits,
    diseaseAudits,
    regimenFindings,
    ragMatches,
    quizProfile,
    quizRiskFindings,
    primaryMechanismId,
    validationSources,
    checksRan,
    checksNotRun,
    limitedCoverage: true,
    summaryStats: {
      packAlerts,
      dosageIssues,
      diseaseMismatches,
      regimenFlags: regimenFindings.length,
      ragFlags,
      quizRiskFlags,
    },
  };
}

export function reverseMatchFacilityStock(
  stock: FacilityStockItem[],
  incomingAlert: RegulatorAlertRecord
): ReverseMatchHit[] {
  const hits: ReverseMatchHit[] = [];
  const aProd = norm(incomingAlert.productName);

  for (const item of stock) {
    const sProd = norm(item.productName);
    const productMatch =
      sProd === aProd ||
      sProd.includes(aProd) ||
      aProd.includes(sProd) ||
      (incomingAlert.activeIngredients.length > 1 &&
        incomingAlert.activeIngredients.every((ai) =>
          ingredientMatches(item.activeIngredients, ai)
        ));

    if (!productMatch) continue;

    const batchMatch =
      incomingAlert.batchNumbers.includes('ALL-BATCHES') ||
      incomingAlert.batchNumbers.some((b) => norm(b) === norm(item.batchNumber));

    hits.push({
      stockItemId: item.id,
      productName: item.productName,
      batchNumber: item.batchNumber,
      shelfLocation: item.shelfLocation,
      quantityPacks: item.quantityPacks,
      matchTier: batchMatch ? 'Confirmed' : 'Same product, different batch',
      alertId: incomingAlert.id,
      agency: incomingAlert.agency,
      reason: incomingAlert.reason,
    });
  }

  return hits;
}

export function buildDeterministicExplanation(
  items: PrescriptionItem[],
  report: VerificationReport,
  language: LanguageCode
): MultilingualExplanation {
  const mech = MECHANISM_TARGETS[report.primaryMechanismId];

  if (language === 'ta') {
    const translatedLines = items
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.brandName} (${i.activeIngredients.join(' + ')}) — ${i.strengthMg} மி.கி, நாளொன்றுக்கு ${i.frequencyPerDay} முறை (${i.totalDailyMg} மி.கி/நாள்), ${i.durationDays} நாட்களுக்கு (${i.route}).`
      )
      .join('\n');

    const verdictText =
      report.overallVerdict === 'SAFE_TO_TAKE'
        ? `சோதனை முடிவு: பாதுகாப்பானது (${report.asOfDate} நிலவரப்படி). சரிபார்க்கப்பட்ட அளவு, நோய் பொருத்தம் மற்றும் ஒழுங்குமுறை எச்சரிக்கைகளில் சிக்கல் இல்லை.`
        : report.overallVerdict === 'ACTION_REQUIRED'
          ? `முக்கிய எச்சரிக்கை: உடனடி மருத்துவ அல்லது மருந்தாளர் சரிபார்ப்பு தேவை. நீங்களாகவே மருந்துகளை நிறுத்த வேண்டாம்.`
          : `கவனம்: அளவு, நோய் பொருத்தம் அல்லது மருந்து இடைவினையில் சில சந்தேகங்கள் உள்ளன. மருத்துவரிடம் சரிபார்க்கவும்.`;

    const issuesTa: string[] = [];
    (report.quizRiskFindings ?? []).forEach((q) =>
      issuesTa.push(
        `நோயாளி உடல்நல வினாடி-வினா உயிராபத்து எச்சரிக்கை (${q.severity}): ${q.drugsInvolved.join(', ')} — ${q.matchedQuizFactor}.`
      )
    );
    report.packChecks
      .filter((p) => p.tier !== 'Not found')
      .forEach((p) =>
        issuesTa.push(`${p.productName} (பேட்ச் ${p.batchNumber}): ஒழுங்குமுறை எச்சரிக்கை (${p.agency}).`)
      );
    report.dosageAudits
      .filter((d) => d.status !== 'Appropriate')
      .forEach((d) =>
        issuesTa.push(
          `${d.brandName}: பரிந்துரைக்கப்பட்ட ${d.prescribedDailyMg} மி.கி/நாள் — ${d.status}.`
        )
      );
    report.diseaseAudits
      .filter((d) => d.status === 'Indication Mismatch')
      .forEach((d) =>
        issuesTa.push(
          `${d.brandName} (${d.ingredient}): "${report.patientCondition}" நோய்க்குப் பொதுவாகப் பொருந்தவில்லை.`
        )
      );
    report.regimenFindings.forEach((f) =>
      issuesTa.push(`${f.title}: ${f.drugsInvolved.join(' + ')}`)
    );

    const summaryExplanation =
      issuesTa.length > 0
        ? `${verdictText} கண்டறியப்பட்டவை: ${issuesTa.join(' ')}`
        : `${verdictText} அனைத்து மருந்துகளும் உங்கள் "${report.patientCondition}" நிலைக்கும் உடல்நல வினாடி-வினா தகவல்களுக்கும் ஏற்ப சரியான அளவில் உள்ளன.`;

    const cellularAlphaFoldNote = `செல் உள் அமைப்பு & AlphaFold (${mech.structureId}): ${mech.name} நொதி செல்லின் "${mech.cellularOrganelle}" பகுதியில் செயல்படுகிறது. ${mech.explanationSummary}`;

    return {
      language: 'ta',
      translatedPrescriptionText: translatedLines,
      summaryExplanation,
      cellularAlphaFoldNote,
      doctorQuestions: [
        (report.quizRiskFindings?.length ?? 0) > 0
          ? `எனது உடல்நல வினாடி-வினாவில் பதிவான ${report.quizRiskFindings![0].matchedQuizFactor} காரணமாக ${report.quizRiskFindings![0].drugsInvolved.join(', ')} மருந்துக்குப் பதிலாக பாதுகாப்பான மாற்று மருந்து உள்ளதா?`
          : 'இந்த மருந்துகளின் தினசரி அளவு எனது வயதுக்கும் நோய்க்கும் சரியானதா?',
        report.regimenFindings.length > 0
          ? `${report.regimenFindings[0].drugsInvolved.join(' மற்றும் ')} ஒன்றாக எடுப்பதற்குப் பதிலாக பாதுகாப்பான மாற்று மருந்து உள்ளதா?`
          : 'மருந்துகளை உணவுக்கு முன் அல்லது பின் எப்போது எடுப்பது சிறந்தது?',
        'இந்த மருந்துகளில் ஏதேனும் தொகுதி (Batch) திரும்பப் பெறப்பட்டதா என்பதை மருந்தகத்தில் உறுதிப்படுத்தலாமா?',
      ],
      spokenScript: `${summaryExplanation} ${cellularAlphaFoldNote}`,
      generatedBy: 'deterministic-template',
    };
  }

  if (language === 'hi') {
    const translatedLines = items
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.brandName} (${i.activeIngredients.join(' + ')}) — ${i.strengthMg} mg, दिन में ${i.frequencyPerDay} बार (${i.totalDailyMg} mg/दिन), ${i.durationDays} दिनों के लिए (${i.route}).`
      )
      .join('\n');

    const quizHi = (report.quizRiskFindings ?? [])
      .map((q) => `${q.drugsInvolved.join(', ')}: ${q.matchedQuizFactor} के कारण गंभीर जोखिम`)
      .join('; ');

    const summaryExplanation =
      report.overallVerdict === 'SAFE_TO_TAKE'
        ? `जाँच परिणाम (${report.asOfDate}): जाँची गई खुराक, बीमारी के मिलान और आपकी स्वास्थ्य प्रश्नावली के अनुसार यह सुरक्षित सीमा में है।`
        : `सावधानी / समीक्षा आवश्यक: ${report.verdictHeadline}।${quizHi ? ` स्वास्थ्य प्रश्नावली चेतावनी: ${quizHi}।` : ''} डॉक्टर या फ़ार्मासिस्ट से सलाह के बिना दवा न लें।`;

    const cellularAlphaFoldNote = `कोशिका की आंतरिक संरचना और AlphaFold (${mech.structureId}): ${mech.name} कोशिका के "${mech.cellularOrganelle}" हिस्से में काम करता है। ${mech.explanationSummary}`;

    return {
      language: 'hi',
      translatedPrescriptionText: translatedLines,
      summaryExplanation,
      cellularAlphaFoldNote,
      doctorQuestions: [
        (report.quizRiskFindings?.length ?? 0) > 0
          ? `मेरी स्वास्थ्य प्रश्नावली (${report.quizRiskFindings![0].matchedQuizFactor}) के कारण ${report.quizRiskFindings![0].drugsInvolved.join(', ')} का सुरक्षित विकल्प क्या है?`
          : 'क्या इन दवाओं की दैनिक खुराक मेरी उम्र और बीमारी के अनुसार सही है?',
        'क्या किसी दवा के बीच टकराव या बैच अलर्ट के कारण सुरक्षित विकल्प उपलब्ध है?',
        'इन दवाओं को भोजन से पहले या बाद में कब लेना चाहिए?',
      ],
      spokenScript: `${summaryExplanation} ${cellularAlphaFoldNote}`,
      generatedBy: 'deterministic-template',
    };
  }

  // English default
  const translatedLines = items
    .map(
      (i, idx) =>
        `${idx + 1}. ${i.brandName} (${i.activeIngredients.join(' + ')}) — ${i.strengthMg} mg, ${i.frequencyPerDay}x daily (${i.totalDailyMg} mg/day) for ${i.durationDays} days · ${i.route}.`
    )
    .join('\n');

  const issuesEn: string[] = [];
  (report.quizRiskFindings ?? []).forEach((q) =>
    issuesEn.push(
      `[QUIZ ${q.severity.toUpperCase()}] ${q.drugsInvolved.join(', ')} matched "${q.matchedQuizFactor}": ${q.clinicalSummary}`
    )
  );
  report.packChecks
    .filter((p) => p.tier !== 'Not found')
    .forEach((p) =>
      issuesEn.push(`Pack check ${p.tier} for ${p.productName} (${p.agency} ${p.alertId}).`)
    );
  report.dosageAudits
    .filter((d) => d.status !== 'Appropriate')
    .forEach((d) => issuesEn.push(`${d.brandName}: ${d.criterionNote}`));
  report.diseaseAudits
    .filter((d) => d.status === 'Indication Mismatch')
    .forEach((d) => issuesEn.push(`${d.brandName}: ${d.criterionNote}`));
  report.regimenFindings.forEach((f) => issuesEn.push(`${f.title}.`));

  const sourceNames = (report.validationSources ?? []).map((s) => `${s.title} (${s.url})`).join('; ');

  const summaryExplanation =
    issuesEn.length > 0
      ? `${report.verdictHeadline}. Combined Quiz & Scanner findings: ${issuesEn.join(' ')}${sourceNames ? ` Validated against: ${sourceNames}.` : ''}`
      : `${report.verdictHeadline}. Every prescribed medicine matches "${report.patientCondition}", clears your health quiz profile, stays within safe daily dosage limits, and shows no regulator alerts or drug clashes as of ${report.asOfDate}.${sourceNames ? ` Validated against: ${sourceNames}.` : ''}`;

  const cellularAlphaFoldNote = `Inside the Cell & AlphaFold (${mech.structureId}, ${mech.provenance}): ${mech.name} operates inside the ${mech.cellularOrganelle}. ${mech.explanationSummary} ${mech.clinicalImplication} Primary structure links: ${mech.rcsbStructureUrl} and ${mech.alphafoldViewerUrl}.`;

  return {
    language: 'en',
    translatedPrescriptionText: translatedLines,
    summaryExplanation,
    cellularAlphaFoldNote,
    doctorQuestions: [
      (report.quizRiskFindings?.length ?? 0) > 0
        ? `Because my health quiz flagged "${report.quizRiskFindings![0].matchedQuizFactor}", can we replace or hold ${report.quizRiskFindings![0].drugsInvolved.join(', ')} safely?`
        : `Are the daily doses appropriate for my age (${report.patientAge}) and kidney/liver health?`,
      report.regimenFindings.length > 0
        ? `Can we switch to a safer alternative that avoids the ${report.regimenFindings[0].drugsInvolved.join(' + ')} clash?`
        : 'Should I take these medicines before or after meals, and are any follow-up lab checks needed?',
      report.diseaseAudits.some((d) => d.status === 'Indication Mismatch')
        ? `Why was ${report.diseaseAudits.find((d) => d.status === 'Indication Mismatch')?.brandName} prescribed alongside "${report.patientCondition}"?`
        : 'Can the pharmacist confirm the strip batch numbers are clear of recent recalls?',
    ],
    spokenScript: `${summaryExplanation} ${cellularAlphaFoldNote}`,
    generatedBy: 'deterministic-template',
  };
}
