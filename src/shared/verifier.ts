import type {
  DiseaseMatchAudit,
  DosageAuditResult,
  FacilityStockItem,
  LanguageCode,
  MechanismTargetId,
  MultilingualExplanation,
  OverallVerdictStatus,
  PackCheckResult,
  PrescriptionItem,
  RagClinicalRecord,
  RagRetrievedMatch,
  RegimenFinding,
  RegulatorAlertRecord,
  ReverseMatchHit,
  VerificationReport,
} from '../types/medguard.ts';
import {
  BANNED_FDC_RULES,
  CONDITION_SYNONYMS,
  DATASET_AS_OF_DATE,
  DOSE_RULES,
  ELDERLY_RISK_RULES,
  INDICATION_RULES,
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
        reason: alert.reason,
        sourceUrl: alert.sourceUrl,
        criteria: {
          productMatch: true,
          manufacturerMatch,
          batchMatch: true,
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
      reason: `${alert.reason} (Alerted batch: ${alert.batchNumbers.join(', ')})`,
      sourceUrl: alert.sourceUrl,
      criteria: {
        productMatch: true,
        manufacturerMatch,
        batchMatch: false,
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
      const minPerDose = Math.round(refRecord.mg_per_kg_min * patientWeightKg * 10) / 10;
      const maxPerDose = Math.round(refRecord.mg_per_kg_max * patientWeightKg * 10) / 10;
      const maxDoses = refRecord.max_doses_per_day ?? 4;
      calculatedWeightDoseRange = `${minPerDose}–${maxPerDose} mg/dose (for ${patientWeightKg} kg; max ${maxDoses} doses/24h)`;

      if (item.strengthMg > maxPerDose) {
        exceedsWeightOrFreq = true;
        issues.push(
          `Single dose ${item.strengthMg} mg exceeds weight-based ceiling ${maxPerDose} mg/dose for ${patientWeightKg} kg.`
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

    const primaryIng = norm(item.activeIngredients[0] || item.brandName);
    const isContraindicatedByAge =
      (primaryIng.includes('nimesulide') && patientAge < 12) ||
      primaryIng.includes('aspirin') ||
      (primaryIng.includes('metoclopramide') && patientAge <= 1) ||
      (refRecord.id === 'rag-cough-cold-unsafe' && patientAge < 4);

    if (isContraindicatedByAge) {
      issues.unshift(`Age ${patientAge} yrs triggers pediatric contraindication/restriction.`);
    }

    const activeTrigger =
      isContraindicatedByAge || exceedsWeightOrFreq || unsafeRecord?.safety_status === 'CONTRAINDICATED' || unsafeRecord?.safety_status === 'RESTRICTED'
        ? unsafeRecord
        : !weightValid || unsafeRecord
          ? unsafeRecord
          : undefined;

    const warningBannerTitle = isContraindicatedByAge || activeTrigger?.safety_status === 'CONTRAINDICATED'
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
  const isPediatric = patientAge > 0 && patientAge < 18;

  if (isPediatric) {
    const isContra =
      (rule.ingredient === 'nimesulide' && patientAge < 12) ||
      rule.ingredient === 'aspirin' ||
      (rule.ingredient === 'metoclopramide' && patientAge <= 1) ||
      ((rule.ingredient === 'chlorpheniramine' || rule.ingredient === 'phenylephrine') &&
        patientAge < 4);

    const ragRef = RAG_CLINICAL_RECORDS.find(
      (r) => r.active_ingredient === rule.ingredient && r.safety_status === 'REFERENCE'
    );
    const weightNote =
      patientWeightKg && patientWeightKg > 0 && ragRef?.mg_per_kg_min && ragRef?.mg_per_kg_max
        ? ` Weight-based reference for ${patientWeightKg} kg: ${Math.round(ragRef.mg_per_kg_min * patientWeightKg)}–${Math.round(ragRef.mg_per_kg_max * patientWeightKg)} mg/dose (max ${ragRef.max_doses_per_day ?? 4} doses/24h).`
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
        ? `Patient age ${patientAge} (<18): ${rule.ingredient} carries a pediatric restriction/contraindication. Do not administer without specialist review.`
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

export function verifyPrescription(
  items: PrescriptionItem[],
  patientCondition: string,
  patientAge: number,
  patientWeightKg?: number
): VerificationReport {
  const packChecks = items.map((item) => verifyPackItem(item));
  const dosageAudits = items.map((item) => auditItemDosage(item, patientAge, patientWeightKg));
  const diseaseAudits = items.map((item) => auditDiseaseMatch(item, patientCondition));
  const ragMatches = retrieveRagMatches(items, patientAge, patientWeightKg);
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
  if (patientAge > 0 && patientAge < 18) {
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
  const criticalFindings = regimenFindings.filter((f) => f.severity === 'Critical').length;
  const hasConfirmedPackAlert = packChecks.some((p) => p.tier === 'Confirmed');

  let overallVerdict: OverallVerdictStatus = 'SAFE_TO_TAKE';
  let verdictHeadline = 'Safe to Consume — Verified Within Rules';
  let verdictQualifier = `Every extracted medicine matches "${patientCondition}" and falls within age-specific (${patientAge} yrs) dosage ceilings with zero regulator alerts or clashes as of ${DATASET_AS_OF_DATE}.`;

  if (
    items.length === 0 ||
    hasConfirmedPackAlert ||
    criticalFindings > 0 ||
    dosageAudits.some(
      (d) => d.status === 'High / Overdose Risk' || d.status === 'Pediatric Contraindication'
    )
  ) {
    overallVerdict = 'ACTION_REQUIRED';
    verdictHeadline = 'Action Required — Safety Issue Detected';
    verdictQualifier =
      'Do not stop or alter prescribed medicines on your own; show this audit report to your prescribing doctor or pharmacist immediately.';
  } else if (
    packAlerts > 0 ||
    dosageIssues > 0 ||
    diseaseMismatches > 0 ||
    regimenFindings.length > 0 ||
    ragFlags > 0
  ) {
    overallVerdict = 'CAUTION_REVIEW';
    verdictHeadline = 'Caution — Review Required Before Consuming';
    verdictQualifier =
      patientAge < 18
        ? 'Pediatric regimen requires weight (kg), formulation strength, dose per administration, and dosing-interval verification against CDSCO / IAP / WHO references.'
        : 'One or more medicines could not be fully matched against your stated disease, patient age, dosage limits, or batch records. Confirm with your doctor or pharmacist.';
  }

  // Pick most relevant cellular mechanism target for AlphaFold Mechanism Lens
  let primaryMechanismId: MechanismTargetId = 'AMPK';
  const findingWithTarget = regimenFindings.find((f) => f.mechanismTargetId);
  if (findingWithTarget?.mechanismTargetId) {
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

  return {
    overallVerdict,
    verdictHeadline,
    verdictQualifier,
    asOfDate: DATASET_AS_OF_DATE,
    patientCondition: patientCondition || 'Unspecified',
    patientAge,
    patientWeightKg,
    packChecks,
    dosageAudits,
    diseaseAudits,
    regimenFindings,
    ragMatches,
    primaryMechanismId,
    summaryStats: {
      packAlerts,
      dosageIssues,
      diseaseMismatches,
      regimenFlags: regimenFindings.length,
      ragFlags,
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
        : `${verdictText} அனைத்து மருந்துகளும் உங்கள் "${report.patientCondition}" நிலைக்கு ஏற்ப சரியான அளவில் உள்ளன.`;

    const cellularAlphaFoldNote = `செல் உள் அமைப்பு & AlphaFold (${mech.structureId}): ${mech.name} நொதி செல்லின் "${mech.cellularOrganelle}" பகுதியில் செயல்படுகிறது. ${mech.explanationSummary}`;

    return {
      language: 'ta',
      translatedPrescriptionText: translatedLines,
      summaryExplanation,
      cellularAlphaFoldNote,
      doctorQuestions: [
        'இந்த மருந்துகளின் தினசரி அளவு எனது வயதுக்கும் நோய்க்கும் சரியானதா?',
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

    const summaryExplanation =
      report.overallVerdict === 'SAFE_TO_TAKE'
        ? `जाँच परिणाम (${report.asOfDate}): जाँची गई खुराक, बीमारी के मिलान और नियामक अलर्ट के अनुसार यह सुरक्षित सीमा में है।`
        : `सावधानी / समीक्षा आवश्यक: ${report.verdictHeadline}। डॉक्टर या फ़ार्मासिस्ट से सलाह के बिना दवा न रोकें।`;

    const cellularAlphaFoldNote = `कोशिका की आंतरिक संरचना और AlphaFold (${mech.structureId}): ${mech.name} कोशिका के "${mech.cellularOrganelle}" हिस्से में काम करता है। ${mech.explanationSummary}`;

    return {
      language: 'hi',
      translatedPrescriptionText: translatedLines,
      summaryExplanation,
      cellularAlphaFoldNote,
      doctorQuestions: [
        'क्या इन दवाओं की दैनिक खुराक मेरी उम्र और बीमारी के अनुसार सही है?',
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

  const summaryExplanation =
    issuesEn.length > 0
      ? `${report.verdictHeadline}. Verified findings: ${issuesEn.join(' ')}`
      : `${report.verdictHeadline}. Every prescribed medicine matches "${report.patientCondition}", stays within safe daily dosage limits, and shows no regulator alerts or drug clashes as of ${report.asOfDate}.`;

  const cellularAlphaFoldNote = `Inside the Cell & AlphaFold (${mech.structureId}, ${mech.provenance}): ${mech.name} operates inside the ${mech.cellularOrganelle}. ${mech.explanationSummary} ${mech.clinicalImplication}`;

  return {
    language: 'en',
    translatedPrescriptionText: translatedLines,
    summaryExplanation,
    cellularAlphaFoldNote,
    doctorQuestions: [
      `Are the daily doses appropriate for my age (${report.patientAge}) and kidney/liver health?`,
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
