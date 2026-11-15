import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { INGREDIENT_REFERENCE_LINKS } from '../data/medguardCatalog.ts';
import type {
  ConditionAgeDosageEvaluation,
  LanguageCode,
  PrescriptionItem,
  RemediationMatchTrigger,
  RemediationPlan,
  RemediationPriority,
  RemediationResourceLink,
  RemediationTodoStep,
  SafetyMeasureItem,
  VerificationReport,
} from '../types/medguard.ts';

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function classifyMatchTrigger(
  report: VerificationReport,
  ragEvaluation?: ConditionAgeDosageEvaluation | null
): {
  classification: RemediationMatchTrigger;
  dosageMatchedCount: number;
  diseaseMatchedCount: number;
  hasCriticalRisk: boolean;
} {
  const dosageMatchedCount = report.dosageAudits.filter(
    (d) => d.status === 'Appropriate'
  ).length;
  const diseaseMatchedCount = report.diseaseAudits.filter(
    (d) => d.status === 'Matches Condition'
  ).length;

  const hasDosageIssue =
    report.dosageAudits.some((d) => d.status !== 'Appropriate') ||
    (ragEvaluation?.flaggedCount ?? 0) > 0;
  const hasDiseaseIssue = report.diseaseAudits.some(
    (d) => d.status === 'Indication Mismatch' || d.status === 'Symptom Relief Only'
  );
  const hasCriticalRisk =
    report.overallVerdict === 'ACTION_REQUIRED' ||
    report.packChecks.some((p) => p.tier === 'Confirmed') ||
    report.regimenFindings.some((f) => f.severity === 'Critical') ||
    (report.quizRiskFindings ?? []).some(
      (q) => q.severity === 'Fatal Risk' || q.severity === 'Critical'
    );

  if (hasCriticalRisk) {
    return {
      classification: 'CRITICAL_SAFETY_REMEDIATION',
      dosageMatchedCount,
      diseaseMatchedCount,
      hasCriticalRisk: true,
    };
  }

  if (dosageMatchedCount > 0 && diseaseMatchedCount > 0 && !hasDosageIssue && !hasDiseaseIssue) {
    return {
      classification: 'DOSAGE_AND_DISEASE_MATCHED',
      dosageMatchedCount,
      diseaseMatchedCount,
      hasCriticalRisk: false,
    };
  }

  if (diseaseMatchedCount > 0 && hasDosageIssue) {
    return {
      classification: 'DISEASE_MATCHED_DOSAGE_ISSUE',
      dosageMatchedCount,
      diseaseMatchedCount,
      hasCriticalRisk: false,
    };
  }

  if (dosageMatchedCount > 0 && hasDiseaseIssue) {
    return {
      classification: 'DOSAGE_MATCHED_DISEASE_MISMATCH',
      dosageMatchedCount,
      diseaseMatchedCount,
      hasCriticalRisk: false,
    };
  }

  return {
    classification: 'GENERAL_CLINICAL_REVIEW',
    dosageMatchedCount,
    diseaseMatchedCount,
    hasCriticalRisk: false,
  };
}

function collectBestCuratedResources(
  items: PrescriptionItem[],
  report: VerificationReport,
  ragEvaluation?: ConditionAgeDosageEvaluation | null
): RemediationResourceLink[] {
  const map = new Map<string, RemediationResourceLink>();
  const add = (r: RemediationResourceLink) => {
    if (!map.has(r.url)) map.set(r.url, r);
  };

  const allIngredients = items.flatMap((i) => i.activeIngredients.map(norm));
  const cond = norm(report.patientCondition);

  // 1. Report's existing authoritative validation sources (FDA DailyMed, CDSCO, IAP, WHO, CredibleMeds)
  for (const vs of report.validationSources ?? []) {
    if (vs.category === 'FDA DailyMed Label' || vs.category === 'Regulatory / Formulary') {
      add({
        id: `vs-${vs.id}`,
        title: vs.title,
        publisher:
          vs.category === 'FDA DailyMed Label'
            ? 'NIH / FDA DailyMed'
            : 'Regulatory & Clinical Formulary',
        scope: vs.relevance,
        url: vs.url,
        sourceType:
          vs.category === 'FDA DailyMed Label'
            ? 'Regulatory / FDA'
            : 'WHO / National Formulary',
      });
    }
  }

  // 2. Ingredient-specific monographs
  for (const ing of allIngredients) {
    const key = Object.keys(INGREDIENT_REFERENCE_LINKS).find(
      (k) => ing === k || ing.includes(k)
    );
    if (key) {
      const ref = INGREDIENT_REFERENCE_LINKS[key];
      add({
        id: `monograph-${key}`,
        title: ref.title,
        publisher: ref.category === 'FDA DailyMed Label' ? 'NIH DailyMed' : 'WHO / CDSCO / IAP',
        scope: ref.relevance,
        url: ref.url,
        sourceType:
          ref.category === 'FDA DailyMed Label'
            ? 'Regulatory / FDA'
            : 'WHO / National Formulary',
      });
    }
  }

  // 3. Backend RAG flag sources
  for (const flag of ragEvaluation?.flags ?? []) {
    if (flag.sourceUrl) {
      add({
        id: `rag-src-${flag.itemId}`,
        title: `${flag.source} — ${flag.medicineName}`,
        publisher: flag.source,
        scope: `Age/condition reference: ${flag.referenceDose}`,
        url: flag.sourceUrl,
        sourceType: 'WHO / National Formulary',
      });
    }
  }

  // 4. Condition-specific clinical practice guidelines ("best resources")
  if (
    cond.includes('diabetes') ||
    allIngredients.some((i) => i.includes('metformin'))
  ) {
    add({
      id: 'ada-diabetes-standards',
      title: 'ADA Standards of Care in Diabetes — Pharmacologic Glycemic & Renal Monitoring',
      publisher: 'American Diabetes Association (ADA)',
      scope: 'Metformin administration, periodic eGFR renal monitoring, and Vitamin B12 screening.',
      url: 'https://diabetesjournals.org/care',
      sourceType: 'Clinical Guideline',
    });
  }

  if (
    cond.includes('cholesterol') ||
    cond.includes('lipid') ||
    allIngredients.some((i) => i.includes('atorvastatin') || i.includes('simvastatin'))
  ) {
    add({
      id: 'acc-aha-lipids',
      title: 'ACC/AHA Guideline on the Management of Blood Cholesterol & Statin Safety',
      publisher: 'American Heart Association / ACC',
      scope: 'Follow-up fasting lipid panel (4–12 weeks), adherence, and myopathy symptom monitoring.',
      url: 'https://www.heart.org/en/health-topics/cholesterol',
      sourceType: 'Clinical Guideline',
    });
  }

  if (
    report.patientAge < 18 ||
    cond.includes('otitis') ||
    cond.includes('fever') ||
    cond.includes('pediatric')
  ) {
    add({
      id: 'who-pediatric-medicines',
      title: 'WHO Model Formulary for Children & Weight-Based Dosing Standards',
      publisher: 'World Health Organization (WHO)',
      scope: 'Child mg/kg dosing accuracy, oral syringe measurement, hydration, and contraindicated analgesics.',
      url: 'https://www.who.int/groups/expert-committee-on-selection-and-use-of-essential-medicines/essential-medicines-lists',
      sourceType: 'WHO / National Formulary',
    });
    add({
      id: 'iap-stg-india',
      title: 'Indian Academy of Pediatrics (IAP) Standard Treatment Guidelines',
      publisher: 'Indian Academy of Pediatrics',
      scope: 'Pediatric fever, otitis media, antibiotic duration, and cough/cold safety restrictions.',
      url: 'https://iapindia.org/',
      sourceType: 'Clinical Guideline',
    });
  }

  if (report.patientAge >= 65) {
    add({
      id: 'ags-beers-2023',
      title: 'AGS Beers Criteria® for Potentially Inappropriate Medication Use in Older Adults',
      publisher: 'American Geriatrics Society',
      scope: 'Elderly dose ceilings, GI/renal NSAID precautions, and fall-risk medication review.',
      url: 'https://agsjournals.onlinelibrary.wiley.com/',
      sourceType: 'Clinical Guideline',
    });
  }

  if (
    allIngredients.some((i) => i.includes('azithromycin') || i.includes('domperidone'))
  ) {
    add({
      id: 'crediblemeds-qt',
      title: 'CredibleMeds® QT Drug Lists — Torsades de Pointes Risk Classification',
      publisher: 'AZCERT / CredibleMeds',
      scope: 'QT-prolonging drug combinations requiring ECG/electrolyte monitoring and prescriber review.',
      url: 'https://crediblemeds.org/',
      sourceType: 'Clinical Guideline',
    });
  }

  // Always include NIH MedlinePlus & WHO Safe Medication Reference
  add({
    id: 'nih-medlineplus-drugs',
    title: 'NIH MedlinePlus — Patient Medication Instructions, Side Effects & Precautions',
    publisher: 'U.S. National Library of Medicine (NIH)',
    scope: 'Plain-language medication adherence, food timing, missed-dose guidance, and warning signs.',
    url: 'https://medlineplus.gov/druginformation.html',
    sourceType: 'Clinical Guideline',
  });
  add({
    id: 'nice-medicines-optimisation',
    title: 'NICE Guideline NG5: Medicines Optimisation — Safe & Effective Use of Medicines',
    publisher: 'National Institute for Health and Care Excellence (NICE)',
    scope: 'Structured medication review, adherence support, and patient safety monitoring plans.',
    url: 'https://www.nice.org.uk/guidance/ng5',
    sourceType: 'Clinical Guideline',
  });

  return Array.from(map.values());
}

export function buildCuratedRemediationPlan(
  items: PrescriptionItem[],
  report: VerificationReport,
  language: LanguageCode,
  ragEvaluation?: ConditionAgeDosageEvaluation | null
): RemediationPlan {
  const matchInfo = classifyMatchTrigger(report, ragEvaluation);
  const allIngredients = items.flatMap((i) => i.activeIngredients.map(norm));
  const steps: RemediationTodoStep[] = [];
  const safetyMeasures: SafetyMeasureItem[] = [];
  let stepCounter = 1;

  const pushStep = (
    priority: RemediationPriority,
    timeframe: string,
    title: string,
    actionDetail: string,
    relatedMedicine: string
  ) => {
    steps.push({
      id: `todo-${stepCounter}`,
      stepNumber: stepCounter++,
      priority,
      timeframe,
      title,
      actionDetail,
      relatedMedicine,
    });
  };

  // 0. Patient Health Quiz Fatal-Risk, Allergy & Surgical Contraindications (Highest Priority)
  for (const qf of report.quizRiskFindings ?? []) {
    pushStep(
      'Immediate',
      'STOP before next dose — urgent clinical review',
      `${qf.category}: ${qf.drugsInvolved.join(', ')} (${qf.matchedQuizFactor})`,
      `${qf.clinicalSummary} ${qf.recommendedAction}`,
      qf.drugsInvolved.join(', ')
    );
  }

  // 1. Batch / Regulatory Recall Remediation
  const confirmedPacks = report.packChecks.filter((p) => p.tier !== 'Not found');
  for (const pack of confirmedPacks) {
    pushStep(
      'Immediate',
      'Before taking any dose from this strip',
      `Quarantine & verify batch ${pack.batchNumber} of ${pack.productName}`,
      `${pack.agency} flagged batch ${pack.batchNumber} (${pack.reason || 'quality/recall alert'}). Do not consume tablets from this batch; return the blister strip to the dispensing pharmacy for an unaffected batch replacement.`,
      pack.productName
    );
  }

  // 2. Critical Drug-Drug Interactions or Banned FDCs
  for (const finding of report.regimenFindings) {
    pushStep(
      finding.severity === 'Critical' ? 'Immediate' : 'Before Next Dose',
      finding.severity === 'Critical' ? 'Today — call prescriber before next dose' : 'Within 24 hours',
      `Resolve ${finding.category}: ${finding.drugsInvolved.join(' + ')}`,
      `${finding.clinicalSummary} Ask your doctor or pharmacist whether one medicine should be temporarily paused or switched to a safer non-interacting alternative.`,
      finding.drugsInvolved.join(' + ')
    );
  }

  // 3. Dosage Issues & Pediatric RAG Flags
  const flaggedDosages = report.dosageAudits.filter((d) => d.status !== 'Appropriate');
  for (const d of flaggedDosages) {
    pushStep(
      d.status === 'High / Overdose Risk' || d.status === 'Pediatric Contraindication'
        ? 'Immediate'
        : 'Before Next Dose',
      'Before administering next dose',
      `Review ${d.brandName} dose (${d.status})`,
      `${d.criterionNote} Confirm exact strength, tablet/syrup concentration, and dosing interval with your clinician before continuing.`,
      `${d.brandName} (${d.prescribedDailyMg} mg/day)`
    );
  }

  if (ragEvaluation && ragEvaluation.flaggedCount > 0) {
    for (const flag of ragEvaluation.flags.filter((f) => f.isPotentiallyUnsafe)) {
      const actionLine = flag.recommendedActions.join(' ');
      pushStep(
        flag.safetyLevel === 'CONTRAINDICATED' ? 'Immediate' : 'Before Next Dose',
        'Before next pediatric administration',
        `Pediatric RAG Check for ${flag.brandName} (${flag.safetyLevel})`,
        `${flag.reasons.join(' ')} ${actionLine || `Reference standard: ${flag.referenceDose}.`}`,
        flag.brandName
      );
    }
  }

  // 4. Disease / Indication Mismatches
  const mismatchAudits = report.diseaseAudits.filter(
    (d) => d.status === 'Indication Mismatch' || d.status === 'Symptom Relief Only'
  );
  for (const m of mismatchAudits) {
    pushStep(
      'Before Next Dose',
      'Before continuing full course',
      `Confirm why ${m.brandName} was prescribed for "${report.patientCondition}"`,
      `${m.criterionNote} Verify with the prescriber whether you have a separate diagnosed condition or if an alternative medicine is intended.`,
      m.brandName
    );
  }

  // 5. When dosage AND/OR medicine matches the given disease safely -> Structured Adherence & Prevention To-Do Plan
  const matchedDosages = report.dosageAudits.filter((d) => d.status === 'Appropriate');
  const matchedDiseases = report.diseaseAudits.filter((d) => d.status === 'Matches Condition');

  if (matchedDosages.length > 0 || matchedDiseases.length > 0) {
    const matchedBrands = Array.from(
      new Set([
        ...matchedDosages.map((d) => d.brandName),
        ...matchedDiseases.map((m) => m.brandName),
      ])
    ).join(', ');

    pushStep(
      'Ongoing Safety',
      'Daily regimen schedule',
      `Follow verified timing, meal pairing, and dosing intervals (${matchedBrands})`,
      items
        .map(
          (i) =>
            `${i.brandName}: take ${i.strengthMg} mg ${i.frequencyPerDay}x/day via ${i.route} for ${i.durationDays} days`
        )
        .join('; ') + '. Never double a missed dose to catch up.',
      matchedBrands
    );

    if (report.patientAge < 18) {
      pushStep(
        'Before Next Dose',
        'Every liquid/pediatric dose',
        'Measure pediatric doses strictly with a calibrated oral syringe',
        `Use a milliliter-marked oral syringe (not a kitchen spoon) matched to ${report.patientWeightKg ? `${report.patientWeightKg} kg` : 'confirmed body weight'}, and keep a written time log to avoid accidental double-dosing across fever syrups.`,
        matchedBrands
      );
    }

    pushStep(
      'Follow-Up',
      items.some((i) => i.durationDays <= 7) ? 'At 48–72 hours & end of course' : 'Before 30-day refill',
      `Track treatment response for "${report.patientCondition}" and schedule follow-up`,
      `Record symptom improvement or vital readings (e.g., fever curve, blood sugar, or blood pressure) and share them at your next clinic review to confirm whether dose continuation or step-down is appropriate.`,
      report.patientCondition
    );
  }

  if (steps.length === 0) {
    pushStep(
      'Follow-Up',
      'Within 24–48 hours',
      'Confirm prescription checklist with dispensing pharmacist',
      'Review medicine labels, expiry dates, and exact daily schedule against your diagnosed condition.',
      items.map((i) => i.brandName).join(', ') || 'Prescribed Regimen'
    );
  }

  // Build targeted Next Safety Measures to Undergo
  if (allIngredients.some((i) => i.includes('metformin'))) {
    safetyMeasures.push({
      id: 'sm-metformin-renal',
      category: 'Clinical Lab / Test',
      title: 'Renal Function (eGFR / Serum Creatinine), HbA1c & Vitamin B12 Monitoring',
      whenToUndergo: 'Baseline, HbA1c every 3 months, eGFR & Vitamin B12 every 6–12 months',
      rationale:
        'Metformin is cleared through the kidneys; periodic eGFR ensures safe clearance and long-term therapy can lower Vitamin B12 absorption.',
      clinicianQuestion:
        'When was my last kidney function (eGFR) and HbA1c checked, and should I hold metformin temporarily before any contrast imaging scan?',
    });
  }

  if (allIngredients.some((i) => i.includes('atorvastatin') || i.includes('simvastatin'))) {
    const hasCypClash = report.regimenFindings.some((f) => f.mechanismTargetId === 'CYP3A4');
    safetyMeasures.push({
      id: 'sm-statin-muscle',
      category: hasCypClash ? 'Emergency Red Flag' : 'Clinical Lab / Test',
      title: hasCypClash
        ? 'Muscle Toxicity Check: Creatine Kinase (CK) & Liver Enzymes (ALT/AST)'
        : 'Fasting Lipid Panel & Muscle Symptom Check',
      whenToUndergo: hasCypClash
        ? 'Immediately if muscle ache, weakness, or dark urine occurs'
        : '4–12 weeks after starting or adjusting statin dose',
      rationale: hasCypClash
        ? 'CYP3A4 inhibition raises statin levels in muscle cells, increasing rhabdomyolysis risk.'
        : 'Confirms LDL cholesterol reduction target and checks baseline tolerability.',
      clinicianQuestion:
        hasCypClash
          ? 'Should I pause my statin during this antibiotic course and get a CK lab test?'
          : 'When should I repeat my fasting lipid profile to confirm target LDL reduction?',
    });
  }

  if (allIngredients.some((i) => i.includes('azithromycin') || i.includes('domperidone'))) {
    safetyMeasures.push({
      id: 'sm-qt-ecg',
      category: 'Vital & Symptom Watch',
      title: 'Cardiac QT-Interval Awareness & Electrolyte (K+ / Mg2+) Check',
      whenToUndergo: 'Before continuing concurrent macrolide + domperidone therapy, or urgently if dizzy/palpitations',
      rationale:
        'Combined hERG potassium channel blockade can prolong the QT interval, especially if potassium or magnesium is low.',
      clinicianQuestion:
        'Do I need an ECG check or an anti-nausea alternative that does not prolong the QT interval?',
    });
  }

  if (allIngredients.some((i) => i.includes('ibuprofen') || i.includes('nimesulide') || i.includes('etodolac'))) {
    safetyMeasures.push({
      id: 'sm-nsaid-gi-renal',
      category: 'Administration & Handling',
      title: 'Hydration, Gastroprotection & Kidney Precaution on NSAIDs',
      whenToUndergo: 'During every day of NSAID use (especially age ≥ 65 or fever dehydration)',
      rationale:
        'COX inhibition lowers protective stomach and renal blood-flow prostaglandins; taking with food and adequate fluids reduces GI/kidney stress.',
      clinicianQuestion:
        'What is the shortest safe duration for this pain/fever medicine, and do I need stomach protection?',
    });
  }

  if (allIngredients.some((i) => i.includes('paracetamol'))) {
    safetyMeasures.push({
      id: 'sm-paracetamol-cumulative',
      category: 'Administration & Handling',
      title: 'Cumulative Daily Paracetamol Ceiling Audit Across All Products',
      whenToUndergo: 'Before every dose (check syrups, cold tablets, and painkillers)',
      rationale:
        'Combination cold/pain products often contain hidden paracetamol; staying strictly under the weight/age daily ceiling protects liver glutathione stores.',
      clinicianQuestion:
        'Are any other cold or pain medicines I am taking also containing paracetamol/acetaminophen?',
    });
  }

  if (allIngredients.some((i) => i.includes('amoxicillin'))) {
    safetyMeasures.push({
      id: 'sm-antibiotic-course',
      category: 'Vital & Symptom Watch',
      title: '48–72 Hour Clinical Response & Allergy Rash Watch',
      whenToUndergo: 'Monitor at 48–72 hours after starting antibiotic therapy',
      rationale:
        'Bacterial symptoms should begin improving within 48–72 hours; watch for hives, wheezing, or persistent diarrhea.',
      clinicianQuestion:
        'If fever or ear/throat pain is not improving after 48–72 hours, when should we re-evaluate?',
    });
  }

  // Add Quiz-matched Fatal Risk Safety Measures if triggered
  if ((report.quizRiskFindings?.length ?? 0) > 0) {
    for (const qf of report.quizRiskFindings ?? []) {
      safetyMeasures.push({
        id: `sm-${qf.id}`,
        category: 'Emergency Red Flag',
        title: `${qf.category}: ${qf.matchedQuizFactor}`,
        whenToUndergo: 'Before taking the next dose — contact prescriber / surgeon urgently',
        rationale: qf.clinicalSummary,
        clinicianQuestion: `My Patient Safety Quiz flagged "${qf.matchedQuizFactor}" alongside ${qf.drugsInvolved.join(', ')}. Which safe alternative should replace it?`,
      });
    }
  }

  // Always include a clear Emergency Red-Flag Safety Measure
  safetyMeasures.push({
    id: 'sm-emergency-red-flags',
    category: 'Emergency Red Flag',
    title: 'Immediate Urgent Care Warning Signs',
    whenToUndergo: 'Seek urgent medical care immediately if any symptom appears',
    rationale:
      'Stop non-emergency self-dosing and seek emergency care for lip/facial swelling, breathing difficulty, chest tightness/fainting, severe muscle weakness, yellowing skin/eyes, or persistent vomiting/lethargy in a child.',
    clinicianQuestion:
      'Which specific warning symptoms mean I should stop this medicine and visit urgent care immediately?',
  });

  const dosageMatchStatusSummary =
    flaggedDosages.length === 0 && (ragEvaluation?.flaggedCount ?? 0) === 0
      ? `${matchedDosages.length}/${report.dosageAudits.length} prescribed doses fall within curated safety ceilings.`
      : `${flaggedDosages.length} dosage ceiling audit(s) and ${ragEvaluation?.flaggedCount ?? 0} RAG safety flag(s) require attention.`;

  const diseaseMatchStatusSummary =
    mismatchAudits.length === 0 && matchedDiseases.length > 0
      ? `${matchedDiseases.length}/${report.diseaseAudits.length} medicines match "${report.patientCondition}".`
      : mismatchAudits.length > 0
        ? `${mismatchAudits.length} medicine(s) show indication mismatch or symptom-only relief for "${report.patientCondition}".`
        : `Indication match pending confirmation for "${report.patientCondition}".`;

  let triggerSummary = '';
  if (language === 'ta') {
    triggerSummary =
      matchInfo.classification === 'DOSAGE_AND_DISEASE_MATCHED'
        ? `மருந்து அளவு மற்றும் "${report.patientCondition}" நோய் பொருத்தம் உறுதிசெய்யப்பட்டது — பாதுகாப்பான தொடர் செயல் திட்டம் மற்றும் அடுத்த பாதுகாப்பு பரிசோதனைகள் கீழே கொடுக்கப்பட்டுள்ளன.`
        : `மருந்து அளவு அல்லது நோய் பொருத்தத்தில் கண்டறியப்பட்ட முடிவுகளின் அடிப்படையில் (${report.overallVerdict}), கீழ்க்காணும் படிப்படியான சரிசெய்தல் திட்டம் (To-Do) மற்றும் பாதுகாப்பு நடவடிக்கைகளைப் பின்பற்றவும்.`;
  } else if (language === 'hi') {
    triggerSummary =
      matchInfo.classification === 'DOSAGE_AND_DISEASE_MATCHED'
        ? `दवा की खुराक और "${report.patientCondition}" रोग मिलान की पुष्टि हो गई है — सुरक्षित पालन और आगामी सुरक्षा जाँच के लिए नीचे दी गई कार्य योजना अपनाएँ।`
        : `खुराक, रोग मिलान या सुरक्षा ऑडिट (${report.overallVerdict}) के आधार पर, नीचे दिए गए चरणबद्ध सुधार (To-Do) और सुरक्षा उपायों का पालन करें।`;
  } else {
    triggerSummary =
      matchInfo.classification === 'DOSAGE_AND_DISEASE_MATCHED'
        ? `Both prescribed dosage and medicine-to-disease match ("${report.patientCondition}") passed curated checks. Follow this structured adherence To-Do checklist and recommended clinical safety monitoring.`
        : `Based on your scan's dosage, disease-match, and safety audit (${report.overallVerdict}), complete these prioritized remediation steps and safety measures before continuing your regimen.`;
  }

  const quizRiskFlagsCount = report.quizRiskFindings?.length ?? 0;
  const quizRiskStatusSummary = report.quizProfile?.completed
    ? quizRiskFlagsCount > 0
      ? `${quizRiskFlagsCount} fatal/critical conflict(s) detected against your Health Quiz (surgery, allergy, or organ risk).`
      : 'Cleared all reported Health Quiz factors (recent surgery, allergies, and organ risks).'
    : 'Patient Health Quiz was skipped; take the Safety Quiz to screen allergies, recent surgery, and fatal organ risks.';

  return {
    planId: `rem-${Date.now()}`,
    generatedAt: new Date().toISOString().slice(0, 10),
    language,
    triggerClassification: matchInfo.classification,
    triggerSummary,
    dosageMatchStatusSummary,
    diseaseMatchStatusSummary,
    quizRiskStatusSummary,
    patientCondition: report.patientCondition,
    patientAge: report.patientAge,
    patientWeightKg: report.patientWeightKg,
    overallVerdict: report.overallVerdict,
    todoSteps: steps,
    safetyMeasures,
    sources: collectBestCuratedResources(items, report, ragEvaluation),
    generatedBy: 'clinical-curated-engine',
  };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : trimmed;
}

export async function generateRemediationPlan(
  ai: GoogleGenAI | null,
  items: PrescriptionItem[],
  report: VerificationReport,
  language: LanguageCode,
  ragEvaluation?: ConditionAgeDosageEvaluation | null
): Promise<RemediationPlan> {
  const baseline = buildCuratedRemediationPlan(items, report, language, ragEvaluation);
  if (!ai) return baseline;

  const targetLang =
    language === 'ta'
      ? 'Tamil (தமிழ் script, natural clear medical guidance)'
      : language === 'hi'
        ? 'Hindi (हिन्दी Devanagari script, natural clear medical guidance)'
        : 'English (clear, plain clinical patient-friendly language)';

  const prompt = `You are MedGuard Clinical Remediation Planner.
Generate a structured, practical, high-precision To-Do Remediation Plan and Next Safety Measures to Undergo in ${targetLang}, grounded in authoritative clinical guidelines (FDA DailyMed, WHO Model Formulary, NICE, CDC, ADA, IAP STG, CDSCO, NIH MedlinePlus).

CONTEXT:
- Match Classification: ${baseline.triggerClassification}
- Dosage Match Summary: ${baseline.dosageMatchStatusSummary}
- Disease Match Summary: ${baseline.diseaseMatchStatusSummary}
- Patient Health Quiz Summary: ${baseline.quizRiskStatusSummary}
- Patient Condition: "${report.patientCondition}", Age: ${report.patientAge} yrs${report.patientWeightKg ? `, Weight: ${report.patientWeightKg} kg` : ''}
- Overall Verdict: ${report.overallVerdict}
- Medicines: ${JSON.stringify(items.map((i) => ({ brandName: i.brandName, ingredients: i.activeIngredients, strengthMg: i.strengthMg, frequencyPerDay: i.frequencyPerDay, totalDailyMg: i.totalDailyMg, durationDays: i.durationDays, route: i.route })))}
- Patient Health Quiz Profile: ${JSON.stringify(report.quizProfile ?? {})}
- Patient Quiz Fatal-Risk Findings: ${JSON.stringify(report.quizRiskFindings ?? [])}
- Dosage Audits: ${JSON.stringify(report.dosageAudits)}
- Disease Audits: ${JSON.stringify(report.diseaseAudits)}
- Regimen Findings: ${JSON.stringify(report.regimenFindings)}
- Pack Checks: ${JSON.stringify(report.packChecks)}
- RAG Evaluation: ${JSON.stringify(ragEvaluation?.flags ?? [])}

RULES:
1. Return ONLY valid JSON (no prose outside JSON) matching this exact shape:
{
  "triggerSummary": "2 concise sentences explaining why this plan was generated based on dosage & condition match",
  "todoSteps": [
    {
      "priority": "Immediate" | "Before Next Dose" | "Ongoing Safety" | "Follow-Up",
      "timeframe": "short timeframe string in ${targetLang}",
      "title": "clear actionable To-Do headline in ${targetLang}",
      "actionDetail": "1-2 practical sentences tailored to these medicines, doses, and condition in ${targetLang}",
      "relatedMedicine": "medicine name"
    }
  ],
  "safetyMeasures": [
    {
      "category": "Clinical Lab / Test" | "Vital & Symptom Watch" | "Administration & Handling" | "Emergency Red Flag",
      "title": "clear safety measure or test name in ${targetLang}",
      "whenToUndergo": "timing string in ${targetLang}",
      "rationale": "concise clinical reason in ${targetLang}",
      "clinicianQuestion": "practical question for doctor/pharmacist in ${targetLang}"
    }
  ]
}
2. Include 4 to 6 concrete todoSteps and 3 to 5 concrete safetyMeasures.
3. Never invent recalls or contradict the verified overallVerdict (${report.overallVerdict}). Never tell patients to abruptly stop critical therapy without consulting a prescriber unless flagged Immediate/Contraindicated.`;

  const runModel = async (model: string) => {
    const config =
      model === 'gemini-4-hydrogen'
        ? {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          }
        : {
            tools: [{ googleSearch: {} }],
          };
    return ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });
  };

  try {
    let response;
    try {
      response = await Promise.race([
        runModel('gemini-4-hydrogen'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini remediation timeout')), 18000)
        ),
      ]);
    } catch {
      response = await Promise.race([
        runModel('gemini-3.1-flash-lite'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini lite remediation timeout')), 12000)
        ),
      ]);
    }

    const rawJson = stripJsonFence(response.text ?? '');
    const parsed = JSON.parse(rawJson) as {
      triggerSummary?: string;
      todoSteps?: Array<Partial<RemediationTodoStep>>;
      safetyMeasures?: Array<Partial<SafetyMeasureItem>>;
    };

    const allowedPriorities: RemediationPriority[] = [
      'Immediate',
      'Before Next Dose',
      'Ongoing Safety',
      'Follow-Up',
    ];
    const allowedCategories: SafetyMeasureItem['category'][] = [
      'Clinical Lab / Test',
      'Vital & Symptom Watch',
      'Administration & Handling',
      'Emergency Red Flag',
    ];

    const todoSteps: RemediationTodoStep[] =
      Array.isArray(parsed.todoSteps) && parsed.todoSteps.length > 0
        ? parsed.todoSteps.map((s, idx) => ({
            id: `gem-todo-${idx + 1}`,
            stepNumber: idx + 1,
            priority: allowedPriorities.includes(s.priority as RemediationPriority)
              ? (s.priority as RemediationPriority)
              : 'Before Next Dose',
            timeframe: String(s.timeframe || 'Within 24 hours'),
            title: String(s.title || `Step ${idx + 1}`),
            actionDetail: String(s.actionDetail || ''),
            relatedMedicine: String(s.relatedMedicine || items[0]?.brandName || 'Regimen'),
          }))
        : baseline.todoSteps;

    const safetyMeasures: SafetyMeasureItem[] =
      Array.isArray(parsed.safetyMeasures) && parsed.safetyMeasures.length > 0
        ? parsed.safetyMeasures.map((m, idx) => ({
            id: `gem-sm-${idx + 1}`,
            category: allowedCategories.includes(m.category as SafetyMeasureItem['category'])
              ? (m.category as SafetyMeasureItem['category'])
              : 'Vital & Symptom Watch',
            title: String(m.title || `Safety Measure ${idx + 1}`),
            whenToUndergo: String(m.whenToUndergo || 'As scheduled with clinician'),
            rationale: String(m.rationale || ''),
            clinicianQuestion: String(m.clinicianQuestion || ''),
          }))
        : baseline.safetyMeasures;

    // Harvest Google Search grounding chunks + merge with curated best clinical resources
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const mergedMap = new Map<string, RemediationResourceLink>();
    baseline.sources.forEach((s) => mergedMap.set(s.url, s));

    chunks.forEach((ch, idx) => {
      const uri = ch?.web?.uri;
      const title = ch?.web?.title;
      if (uri && title && !mergedMap.has(uri)) {
        let host = 'Grounded Clinical Web Resource';
        try {
          host = new URL(uri).hostname.replace(/^www\./, '');
        } catch {
          // ignore malformed URL host
        }
        mergedMap.set(uri, {
          id: `ground-${idx + 1}`,
          title,
          publisher: host,
          scope: `Live search-grounded clinical reference for ${report.patientCondition}.`,
          url: uri,
          sourceType: 'Grounded Web Resource',
        });
      }
    });

    return {
      ...baseline,
      triggerSummary: parsed.triggerSummary?.trim() || baseline.triggerSummary,
      todoSteps,
      safetyMeasures,
      sources: Array.from(mergedMap.values()),
      generatedBy: 'gemini-grounded',
    };
  } catch {
    return baseline;
  }
}
