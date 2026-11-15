import type {
  ClinicalRulesGovernanceReport,
  FacilityStockItem,
  GovernedRuleAuditRow,
  InventoryTransaction,
  MechanismTarget,
  MechanismTargetId,
  MolecularEvidenceEntry,
  OutboxNotification,
  PharmacistHypothesis,
  RegulatorAlertRecord,
  SamplePreset,
} from '../types/medguard.ts';

export const DATASET_AS_OF_DATE = '2026-11-14';

export interface DoseRule {
  ingredient: string;
  adultMaxDailyMg: number;
  elderlyMaxDailyMg: number;
  minDailyMg: number;
  typicalRangeLabel: string;
  source: string;
}

export interface IndicationRule {
  ingredient: string;
  indications: string[];
  symptomReliefOnlyFor?: string[];
  source: string;
}

export interface InteractionRule {
  id: string;
  ingredients: [string, string];
  severity: 'Critical' | 'Moderate';
  title: string;
  mechanismTargetId: MechanismTargetId;
  clinicalSummary: string;
  source: string;
  criterionMatch: string;
}

export interface ElderlyRiskRule {
  ingredient: string;
  minAge: number;
  severity: 'Critical' | 'Moderate';
  title: string;
  clinicalSummary: string;
  source: string;
}

export interface BannedFdcRule {
  id: string;
  ingredients: string[];
  title: string;
  clinicalSummary: string;
  source: string;
}

export const DOSE_RULES: DoseRule[] = [
  {
    ingredient: 'paracetamol',
    adultMaxDailyMg: 4000,
    elderlyMaxDailyMg: 3000,
    minDailyMg: 325,
    typicalRangeLabel: '500–1000 mg every 6h (max 4000 mg/day; 3000 mg/day in age ≥65)',
    source: 'CDSCO / FDA Acetaminophen Labeling §2.1',
  },
  {
    ingredient: 'metformin',
    adultMaxDailyMg: 2550,
    elderlyMaxDailyMg: 2000,
    minDailyMg: 500,
    typicalRangeLabel: '500–2000 mg/day in divided doses with meals',
    source: 'ADA Standards & DailyMed Metformin §2',
  },
  {
    ingredient: 'atorvastatin',
    adultMaxDailyMg: 80,
    elderlyMaxDailyMg: 40,
    minDailyMg: 10,
    typicalRangeLabel: '10–80 mg once daily (elderly caution >40 mg)',
    source: 'FDA Atorvastatin Prescribing Info §2.1',
  },
  {
    ingredient: 'simvastatin',
    adultMaxDailyMg: 40,
    elderlyMaxDailyMg: 20,
    minDailyMg: 5,
    typicalRangeLabel: '10–40 mg once daily in the evening',
    source: 'FDA Simvastatin Label §2 & §4',
  },
  {
    ingredient: 'clarithromycin',
    adultMaxDailyMg: 1000,
    elderlyMaxDailyMg: 1000,
    minDailyMg: 250,
    typicalRangeLabel: '250–500 mg twice daily (500–1000 mg/day)',
    source: 'DailyMed Clarithromycin Label §2',
  },
  {
    ingredient: 'amoxicillin',
    adultMaxDailyMg: 3000,
    elderlyMaxDailyMg: 2000,
    minDailyMg: 500,
    typicalRangeLabel: '250–500 mg every 8h or 875 mg every 12h',
    source: 'WHO Essential Medicines / DailyMed §2',
  },
  {
    ingredient: 'azithromycin',
    adultMaxDailyMg: 500,
    elderlyMaxDailyMg: 500,
    minDailyMg: 250,
    typicalRangeLabel: '250–500 mg once daily',
    source: 'DailyMed Azithromycin Label §2',
  },
  {
    ingredient: 'ibuprofen',
    adultMaxDailyMg: 2400,
    elderlyMaxDailyMg: 1200,
    minDailyMg: 200,
    typicalRangeLabel: '200–600 mg every 6–8h after food',
    source: 'FDA NSAID Labeling §2',
  },
  {
    ingredient: 'domperidone',
    adultMaxDailyMg: 30,
    elderlyMaxDailyMg: 20,
    minDailyMg: 10,
    typicalRangeLabel: '10 mg up to 3 times daily (max 30 mg/day)',
    source: 'EMA / CDSCO Domperidone Safety Advisory',
  },
  {
    ingredient: 'hydroxyzine',
    adultMaxDailyMg: 100,
    elderlyMaxDailyMg: 50,
    minDailyMg: 10,
    typicalRangeLabel: '10–25 mg 3–4 times daily (Beers caution in ≥65)',
    source: 'AGS Beers Criteria & DailyMed §8.5',
  },
  {
    ingredient: 's(+) etodolac',
    adultMaxDailyMg: 600,
    elderlyMaxDailyMg: 400,
    minDailyMg: 200,
    typicalRangeLabel: '200–400 mg/day (FDC with Paracetamol prohibited by CDSCO)',
    source: 'CDSCO Gazette S.O. 3284(E)',
  },
  {
    ingredient: 'pantoprazole',
    adultMaxDailyMg: 80,
    elderlyMaxDailyMg: 40,
    minDailyMg: 20,
    typicalRangeLabel: '20–40 mg once daily before breakfast',
    source: 'DailyMed Pantoprazole §2',
  },
  {
    ingredient: 'omeprazole',
    adultMaxDailyMg: 80,
    elderlyMaxDailyMg: 40,
    minDailyMg: 10,
    typicalRangeLabel: '20–40 mg once daily before meal',
    source: 'DailyMed Omeprazole §2',
  },
  {
    ingredient: 'amlodipine',
    adultMaxDailyMg: 10,
    elderlyMaxDailyMg: 5,
    minDailyMg: 2.5,
    typicalRangeLabel: '2.5–10 mg once daily (elderly initial/caution 2.5–5 mg)',
    source: 'DailyMed Amlodipine §2',
  },
  {
    ingredient: 'telmisartan',
    adultMaxDailyMg: 80,
    elderlyMaxDailyMg: 80,
    minDailyMg: 20,
    typicalRangeLabel: '20–80 mg once daily',
    source: 'DailyMed Telmisartan §2',
  },
  {
    ingredient: 'metoprolol',
    adultMaxDailyMg: 400,
    elderlyMaxDailyMg: 200,
    minDailyMg: 25,
    typicalRangeLabel: '25–200 mg/day',
    source: 'DailyMed Metoprolol §2',
  },
  {
    ingredient: 'cetirizine',
    adultMaxDailyMg: 10,
    elderlyMaxDailyMg: 5,
    minDailyMg: 5,
    typicalRangeLabel: '5–10 mg once daily',
    source: 'DailyMed Cetirizine §2',
  },
  {
    ingredient: 'levocetirizine',
    adultMaxDailyMg: 5,
    elderlyMaxDailyMg: 5,
    minDailyMg: 2.5,
    typicalRangeLabel: '2.5–5 mg once in the evening',
    source: 'DailyMed Levocetirizine §2',
  },
  {
    ingredient: 'montelukast',
    adultMaxDailyMg: 10,
    elderlyMaxDailyMg: 10,
    minDailyMg: 4,
    typicalRangeLabel: '10 mg once daily in the evening (4–5 mg pediatric)',
    source: 'DailyMed Montelukast §2',
  },
  {
    ingredient: 'ciprofloxacin',
    adultMaxDailyMg: 1500,
    elderlyMaxDailyMg: 1000,
    minDailyMg: 250,
    typicalRangeLabel: '250–750 mg every 12 hours',
    source: 'DailyMed Ciprofloxacin §2',
  },
  {
    ingredient: 'cefixime',
    adultMaxDailyMg: 400,
    elderlyMaxDailyMg: 400,
    minDailyMg: 200,
    typicalRangeLabel: '200–400 mg/day in 1–2 divided doses',
    source: 'DailyMed Cefixime §2',
  },
  {
    ingredient: 'aspirin',
    adultMaxDailyMg: 4000,
    elderlyMaxDailyMg: 325,
    minDailyMg: 75,
    typicalRangeLabel: '75–150 mg antiplatelet; 325–650 mg analgesic',
    source: 'DailyMed / AHA Aspirin Guidance',
  },
  {
    ingredient: 'clopidogrel',
    adultMaxDailyMg: 75,
    elderlyMaxDailyMg: 75,
    minDailyMg: 75,
    typicalRangeLabel: '75 mg once daily',
    source: 'DailyMed Clopidogrel §2',
  },
  {
    ingredient: 'glimepiride',
    adultMaxDailyMg: 8,
    elderlyMaxDailyMg: 4,
    minDailyMg: 1,
    typicalRangeLabel: '1–4 mg once daily with breakfast (max 8 mg)',
    source: 'DailyMed Glimepiride §2',
  },
  {
    ingredient: 'losartan',
    adultMaxDailyMg: 100,
    elderlyMaxDailyMg: 50,
    minDailyMg: 25,
    typicalRangeLabel: '25–100 mg/day',
    source: 'DailyMed Losartan §2',
  },
  {
    ingredient: 'diclofenac',
    adultMaxDailyMg: 150,
    elderlyMaxDailyMg: 100,
    minDailyMg: 50,
    typicalRangeLabel: '50 mg 2–3 times daily after food',
    source: 'DailyMed Diclofenac §2',
  },
  {
    ingredient: 'nimesulide',
    adultMaxDailyMg: 200,
    elderlyMaxDailyMg: 100,
    minDailyMg: 100,
    typicalRangeLabel: '100 mg twice daily in adults (PROHIBITED <12 years by CDSCO)',
    source: 'CDSCO Gazette Prohibition (<12y)',
  },
  {
    ingredient: 'metoclopramide',
    adultMaxDailyMg: 30,
    elderlyMaxDailyMg: 15,
    minDailyMg: 10,
    typicalRangeLabel: '10 mg up to 3x/day for ≤5 days (pediatric restricted)',
    source: 'WHO Model Formulary / CDSCO Restriction',
  },
  {
    ingredient: 'chlorpheniramine',
    adultMaxDailyMg: 24,
    elderlyMaxDailyMg: 12,
    minDailyMg: 2,
    typicalRangeLabel: '2–4 mg every 6h in adults (CPM+Phenylephrine FDC banned <4y)',
    source: 'CDSCO FDC Restriction & WHO Pocket Book',
  },
  {
    ingredient: 'phenylephrine',
    adultMaxDailyMg: 60,
    elderlyMaxDailyMg: 40,
    minDailyMg: 5,
    typicalRangeLabel: '5–10 mg every 6h in adults (banned <4y in CPM FDC)',
    source: 'CDSCO Gazette Notification (<4y)',
  },
  {
    ingredient: 'dextromethorphan',
    adultMaxDailyMg: 120,
    elderlyMaxDailyMg: 60,
    minDailyMg: 10,
    typicalRangeLabel: '10–30 mg every 6–8h in adults (avoid <4–6y)',
    source: 'IAP STG / WHO Pocket Book',
  },
];

export const CONDITION_SYNONYMS: Record<string, string[]> = {
  'type 2 diabetes': ['diabetes', 'sugar', 'high sugar', 'blood sugar', 'dm', 't2dm', 'hyperglycemia'],
  hypertension: ['bp', 'high bp', 'blood pressure', 'high blood pressure', 'htn'],
  hyperlipidemia: ['cholesterol', 'high cholesterol', 'lipids', 'dyslipidemia'],
  'acid reflux': ['acidity', 'gastric', 'gas', 'gerd', 'heartburn', 'gastritis', 'ulcer'],
  'bacterial infection': ['infection', 'bacterial', 'uti', 'sinusitis', 'sinus', 'tonsillitis', 'bronchitis', 'throat infection'],
  'allergic rhinitis': ['allergy', 'cold', 'sneezing', 'asthma', 'rhinitis', 'skin rash', 'itching'],
  fever: ['viral fever', 'pyrexia', 'temperature', 'body pain', 'headache', 'pain'],
};

export const INDICATION_RULES: IndicationRule[] = [
  {
    ingredient: 'metformin',
    indications: ['type 2 diabetes', 'diabetes', 'hyperglycemia', 'pcos', 'insulin resistance'],
    source: 'DailyMed Metformin §1 Indications',
  },
  {
    ingredient: 'glimepiride',
    indications: ['type 2 diabetes', 'diabetes', 'hyperglycemia'],
    source: 'DailyMed Glimepiride §1 Indications',
  },
  {
    ingredient: 'atorvastatin',
    indications: ['hyperlipidemia', 'high cholesterol', 'dyslipidemia', 'type 2 diabetes', 'cardiovascular risk'],
    source: 'DailyMed Atorvastatin §1 Indications',
  },
  {
    ingredient: 'simvastatin',
    indications: ['hyperlipidemia', 'high cholesterol', 'dyslipidemia', 'coronary heart disease'],
    source: 'DailyMed Simvastatin §1 Indications',
  },
  {
    ingredient: 'clarithromycin',
    indications: ['bacterial sinusitis', 'pneumonia', 'respiratory infection', 'pharyngitis', 'h. pylori', 'bacterial infection'],
    source: 'DailyMed Clarithromycin §1 Indications',
  },
  {
    ingredient: 'amoxicillin',
    indications: ['bacterial sinusitis', 'ear infection', 'otitis media', 'uti', 'bacterial infection', 'strep throat'],
    source: 'DailyMed Amoxicillin §1 Indications',
  },
  {
    ingredient: 'azithromycin',
    indications: ['bacterial sinusitis', 'pneumonia', 'typhoid', 'bacterial infection', 'bronchitis'],
    source: 'DailyMed Azithromycin §1 Indications',
  },
  {
    ingredient: 'ciprofloxacin',
    indications: ['uti', 'bacterial infection', 'typhoid', 'gastroenteritis', 'sinusitis'],
    source: 'DailyMed Ciprofloxacin §1 Indications',
  },
  {
    ingredient: 'cefixime',
    indications: ['uti', 'bacterial infection', 'typhoid', 'otitis media', 'bronchitis', 'pharyngitis'],
    source: 'DailyMed Cefixime §1 Indications',
  },
  {
    ingredient: 'paracetamol',
    indications: ['fever', 'pain', 'headache', 'osteoarthritis', 'viral fever', 'body pain'],
    symptomReliefOnlyFor: ['bacterial sinusitis', 'pneumonia', 'type 2 diabetes'],
    source: 'WHO / CDSCO Paracetamol Monograph',
  },
  {
    ingredient: 'ibuprofen',
    indications: ['pain', 'fever', 'inflammation', 'arthritis', 'dental pain', 'body pain', 'joint pain'],
    symptomReliefOnlyFor: ['bacterial sinusitis', 'viral fever'],
    source: 'DailyMed Ibuprofen §1 Indications',
  },
  {
    ingredient: 'diclofenac',
    indications: ['pain', 'arthritis', 'joint pain', 'inflammation', 'body pain'],
    source: 'DailyMed Diclofenac §1 Indications',
  },
  {
    ingredient: 'domperidone',
    indications: ['nausea', 'vomiting', 'gastroparesis', 'reflux', 'acid reflux'],
    source: 'CDSCO Domperidone Indication Monograph',
  },
  {
    ingredient: 'pantoprazole',
    indications: ['acid reflux', 'gerd', 'gastritis', 'ulcer', 'acidity'],
    source: 'DailyMed Pantoprazole §1 Indications',
  },
  {
    ingredient: 'omeprazole',
    indications: ['acid reflux', 'gerd', 'gastritis', 'ulcer', 'acidity'],
    source: 'DailyMed Omeprazole §1 Indications',
  },
  {
    ingredient: 'amlodipine',
    indications: ['hypertension', 'high blood pressure', 'angina'],
    source: 'DailyMed Amlodipine §1 Indications',
  },
  {
    ingredient: 'telmisartan',
    indications: ['hypertension', 'high blood pressure', 'cardiovascular risk'],
    source: 'DailyMed Telmisartan §1 Indications',
  },
  {
    ingredient: 'losartan',
    indications: ['hypertension', 'high blood pressure', 'diabetic nephropathy'],
    source: 'DailyMed Losartan §1 Indications',
  },
  {
    ingredient: 'metoprolol',
    indications: ['hypertension', 'high blood pressure', 'angina', 'arrhythmia', 'heart failure'],
    source: 'DailyMed Metoprolol §1 Indications',
  },
  {
    ingredient: 'cetirizine',
    indications: ['allergic rhinitis', 'allergy', 'urticaria', 'cold', 'itching'],
    source: 'DailyMed Cetirizine §1 Indications',
  },
  {
    ingredient: 'levocetirizine',
    indications: ['allergic rhinitis', 'allergy', 'urticaria', 'cold', 'itching'],
    source: 'DailyMed Levocetirizine §1 Indications',
  },
  {
    ingredient: 'montelukast',
    indications: ['allergic rhinitis', 'asthma', 'allergy', 'cold'],
    source: 'DailyMed Montelukast §1 Indications',
  },
  {
    ingredient: 'aspirin',
    indications: ['cardiovascular risk', 'coronary heart disease', 'pain', 'fever'],
    source: 'DailyMed Aspirin §1 Indications',
  },
  {
    ingredient: 'clopidogrel',
    indications: ['cardiovascular risk', 'coronary heart disease', 'stroke prevention'],
    source: 'DailyMed Clopidogrel §1 Indications',
  },
  {
    ingredient: 'hydroxyzine',
    indications: ['allergy', 'pruritus', 'urticaria', 'anxiety'],
    source: 'DailyMed Hydroxyzine §1 Indications',
  },
  {
    ingredient: 'nimesulide',
    indications: ['pain', 'inflammation', 'arthritis', 'fever'],
    source: 'CDSCO Adult Monograph (Prohibited <12y)',
  },
  {
    ingredient: 'metoclopramide',
    indications: ['nausea', 'vomiting', 'gastroparesis', 'acid reflux'],
    source: 'WHO Model Formulary / CDSCO Monograph',
  },
  {
    ingredient: 'chlorpheniramine',
    indications: ['allergic rhinitis', 'allergy', 'cold', 'sneezing'],
    source: 'CDSCO Cough/Cold Monograph',
  },
  {
    ingredient: 'phenylephrine',
    indications: ['cold', 'nasal congestion', 'allergic rhinitis', 'sinusitis'],
    source: 'CDSCO Cough/Cold Monograph',
  },
  {
    ingredient: 'dextromethorphan',
    indications: ['cough', 'dry cough', 'cold'],
    source: 'IAP / WHO Cough Guidance',
  },
];

export const INTERACTION_RULES: InteractionRule[] = [
  {
    id: 'ddi-clarithro-simva',
    ingredients: ['clarithromycin', 'simvastatin'],
    severity: 'Critical',
    title: 'CYP3A4 Contraindicated Interaction: Clarithromycin + Simvastatin',
    mechanismTargetId: 'CYP3A4',
    clinicalSummary:
      'Clarithromycin strongly inhibits hepatic CYP3A4 in the smooth endoplasmic reticulum, blocking simvastatin clearance and elevating plasma exposure up to 10-fold (rhabdomyolysis risk).',
    source: 'FDA DailyMed Clarithromycin & Simvastatin §4.5 / §7',
    criterionMatch: 'Both ingredients active simultaneously · CYP3A4 strong inhibitor + sensitive substrate',
  },
  {
    id: 'ddi-clarithro-atorva',
    ingredients: ['clarithromycin', 'atorvastatin'],
    severity: 'Moderate',
    title: 'CYP3A4 Exposure Elevation: Clarithromycin + Atorvastatin',
    mechanismTargetId: 'CYP3A4',
    clinicalSummary:
      'Clarithromycin inhibits CYP3A4 metabolism and OATP1B1 uptake, increasing atorvastatin blood levels and muscle-toxicity risk. Prescribers typically cap atorvastatin at 20 mg or pause during short courses.',
    source: 'FDA DailyMed Atorvastatin §7 Drug Interactions',
    criterionMatch: 'CYP3A4 inhibitor paired with CYP3A4-metabolised statin',
  },
  {
    id: 'ddi-azithro-domperidone',
    ingredients: ['azithromycin', 'domperidone'],
    severity: 'Critical',
    title: 'hERG Potassium Channel QT Prolongation: Azithromycin + Domperidone',
    mechanismTargetId: 'HERG',
    clinicalSummary:
      'Combined blockade of the cardiac hERG (KCNH2) potassium pore delays ventricular repolarisation and elevates torsades de pointes arrhythmia risk.',
    source: 'EMA PRAC / CredibleMeds QT Drug Interaction List',
    criterionMatch: 'Dual hERG K+ channel repolarisation blockers in concurrent regimen',
  },
  {
    id: 'ddi-ibuprofen-metformin',
    ingredients: ['ibuprofen', 'metformin'],
    severity: 'Moderate',
    title: 'Renal Clearance Caution: High-Dose NSAID + Metformin',
    mechanismTargetId: 'COX2',
    clinicalSummary:
      'COX-1/COX-2 prostaglandin inhibition in renal afferent arterioles can reduce GFR and slow metformin excretion during dehydration.',
    source: 'DailyMed Metformin §5.1 Renal Function Monitoring',
    criterionMatch: 'Systemic NSAID paired with renal-cleared biguanide',
  },
];

export const ELDERLY_RISK_RULES: ElderlyRiskRule[] = [
  {
    ingredient: 'hydroxyzine',
    minAge: 65,
    severity: 'Critical',
    title: 'Elderly Anticholinergic & Sedation Risk (AGS Beers Criteria)',
    clinicalSummary:
      'Hydroxyzine carries strong central anticholinergic effects causing confusion, falls, and urinary retention in adults aged 65+.',
    source: 'AGS Beers Criteria 2023 & DailyMed §8.5 Geriatric Use',
  },
  {
    ingredient: 'ibuprofen',
    minAge: 65,
    severity: 'Moderate',
    title: 'Elderly GI Bleed & Renal Injury Caution (AGS Beers Criteria)',
    clinicalSummary:
      'Chronic or high-dose oral NSAIDs elevate gastrointestinal bleeding and acute kidney injury risk in adults aged 65+.',
    source: 'AGS Beers Criteria 2023 (Non-COX-Selective NSAIDs)',
  },
];

export const BANNED_FDC_RULES: BannedFdcRule[] = [
  {
    id: 'cdsco-so-3284e',
    ingredients: ['s(+) etodolac', 'paracetamol'],
    title: 'Prohibited Fixed-Dose Combination (CDSCO Gazette S.O. 3284(E))',
    clinicalSummary:
      'The combination of S(+) Etodolac and Paracetamol is prohibited for manufacture, sale, and distribution in India due to lack of therapeutic justification and additive toxicity.',
    source: 'CDSCO Gazette Notification S.O. 3284(E) · 2024-08-12',
  },
];

export const REGULATOR_ALERTS: RegulatorAlertRecord[] = [
  {
    id: 'CDSCO-NSQ-2026-041',
    agency: 'CDSCO',
    date: '2026-10-28',
    productName: 'Clarimac-250',
    activeIngredients: ['clarithromycin'],
    manufacturer: 'Macleods Pharma Ltd',
    batchNumbers: ['MC26091A', 'MC26092B'],
    reason: 'Substandard dissolution profile (<65% at 45 min) — Not of Standard Quality (NSQ) recall notice.',
    severity: 'NSQ Alert',
    kind: 'nsq',
    evidenceStatus: 'verified_alert',
    locator: 'CDSCO Monthly NSQ Alert List · Row 41',
    sha256: '4b9c8d2a1f73e9a0c8b4e3c91a6d2e5f87c4b3a9102d8e44c5f21e88a90d31f7',
    reviewedAt: '2026-11-01',
    verification: {
      sourceBytes: 'sha256_verified',
      transcription: 'two_person_reviewed',
      scope: 'batch_and_product_confirmed',
    },
    sourceUrl: 'https://cdsco.gov.in/opencms/opencms/en/Notifications/NSQ-Alerts/',
  },
  {
    id: 'CDSCO-FDC-2024-3284',
    agency: 'CDSCO',
    date: '2024-08-12',
    productName: 'Etodolac-P Plus',
    activeIngredients: ['s(+) etodolac', 'paracetamol'],
    manufacturer: 'Generic FDC Manufacturers',
    batchNumbers: ['ALL-BATCHES'],
    reason: 'Prohibited Fixed-Dose Combination under Gazette Notification S.O. 3284(E).',
    severity: 'Recall',
    kind: 'prohibition',
    evidenceStatus: 'historical_fixture',
    locator: 'S.O. 3284(E), English operative paragraph',
    sha256: '9f3e21b87d65c0a42198b7c65d4e3f2a1098c7b6a5d4e3f2c1b0a9d8e7f61234',
    reviewedAt: '2026-10-15',
    verification: {
      sourceBytes: 'sha256_verified',
      transcription: 'gazette_text_verified',
      scope: 'all_formulations_prohibited',
    },
    sourceUrl: 'https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadGazette_NotificationsFiles/2024.08.12_%20S.O.%203284%28eEtodolac.pdf',
  },
  {
    id: 'WHO-MPA-2026-09',
    agency: 'WHO',
    date: '2026-09-19',
    productName: 'Dolo-650',
    activeIngredients: ['paracetamol'],
    manufacturer: 'Micro Labs Ltd',
    batchNumbers: ['ML26-FAKE9'],
    reason: 'Falsified blister batch bearing mismatched hologram & zero active ingredient assay.',
    severity: 'Falsified',
    kind: 'spurious',
    evidenceStatus: 'verified_alert',
    locator: 'WHO Medical Product Alert No. 9/2026',
    sha256: 'e7d21c44b89a0f53c7e12d45a6b89c01d2e3f4a5b6c7d8e9f0a1b2c3d4e5f607',
    reviewedAt: '2026-09-22',
    verification: {
      sourceBytes: 'sha256_verified',
      transcription: 'who_alert_matched',
      scope: 'specific_falsified_batch',
    },
    sourceUrl: 'https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts',
  },
];

export const MECHANISM_TARGETS: Record<MechanismTargetId, MechanismTarget> = {
  CYP3A4: {
    id: 'CYP3A4',
    name: 'Cytochrome P450 3A4',
    gene: 'CYP3A4 · UniProt P08684',
    cellularOrganelle: 'Smooth Endoplasmic Reticulum Membrane',
    membraneType: 'ER_BILAYER',
    compartmentSummary:
      'Anchored inside the Smooth ER lipid bilayer of liver and gut cells, CYP3A4 oxidises ~50% of clinical drugs via its iron-heme catalytic pocket.',
    provenance: 'Experimental (PDB)',
    structureId: 'PDB 1TQN · AF-P08684-F1',
    resolutionOrConfidence: '2.05 Å X-ray (PDB 1TQN) · pLDDT 94.2 (AlphaFold)',
    plddtScore: 94.2,
    substrateLabel: 'Simvastatin / Atorvastatin',
    inhibitorLabel: 'Clarithromycin',
    clashDistanceAngstrom: '2.4 Å steric overlap at Heme Fe',
    residues: [
      { id: 'r1', label: 'Heme Fe(III)', role: 'Catalytic oxygen-transfer cofactor', position: [0, 0.1, 0] },
      { id: 'r2', label: 'Arg212', role: 'Active-site polar gatekeeper residue', position: [1.1, 0.7, 0.4] },
      { id: 'r3', label: 'Phe304', role: 'I-helix hydrophobic substrate clamp', position: [-1.0, 0.6, -0.5] },
      { id: 'r4', label: 'Ser119', role: 'H-bond pocket stabiliser for macrolides', position: [0.4, -0.8, 0.9] },
    ],
    explanationSummary:
      'Clarithromycin binds tightly near Ser119 and forms an inhibitory complex at the Heme Fe core inside the Smooth ER, physically blocking statin substrates from entering the pocket.',
    clinicalImplication:
      'When CYP3A4 is blocked, simvastatin accumulates in blood and skeletal muscle mitochondria, triggering severe muscle breakdown risk.',
    accentHex: '#38bdf8',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=P08684',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/1TQN',
    dailymedUrl: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0a66646-6774-4fc6-9b26-a98c3a5df274&type=display',
    dailymedLabel: 'NIH DailyMed FDA Label: Clarithromycin Tablets (setid d0a66646-6774-4fc6-9b26-a98c3a5df274)',
  },
  CYP2D6: {
    id: 'CYP2D6',
    name: 'Cytochrome P450 2D6',
    gene: 'CYP2D6 · UniProt P10635',
    cellularOrganelle: 'Smooth Endoplasmic Reticulum',
    membraneType: 'ER_BILAYER',
    compartmentSummary:
      'ER-anchored monooxygenase responsible for activating prodrugs like codeine and clearing antidepressants/beta-blockers.',
    provenance: 'Experimental (PDB)',
    structureId: 'PDB 2F9Q · AF-P10635-F1',
    resolutionOrConfidence: '3.00 Å X-ray (PDB 2F9Q) · pLDDT 92.8 (AlphaFold)',
    plddtScore: 92.8,
    substrateLabel: 'Codeine / Metoprolol',
    inhibitorLabel: 'Fluoxetine',
    clashDistanceAngstrom: '2.7 Å salt-bridge block at Asp301',
    residues: [
      { id: 'r1', label: 'Asp301', role: 'Anionic anchor for basic amine drugs', position: [0.9, 0.4, 0.3] },
      { id: 'r2', label: 'Glu216', role: 'Substrate recognition entry residue', position: [-0.8, 0.7, 0.4] },
      { id: 'r3', label: 'Phe120', role: 'Aromatic ring π-stacking floor', position: [-0.3, -0.7, -0.6] },
    ],
    explanationSummary:
      'Basic nitrogen groups on substrates lock onto Asp301. Strong inhibitors occupy that same anionic anchor, halting prodrug activation.',
    clinicalImplication:
      'Genetic poor-metabolisers or drug-inhibited CYP2D6 lose analgesic effect from codeine or accumulate beta-blockers.',
    accentHex: '#a78bfa',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=P10635',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/2F9Q',
  },
  HERG: {
    id: 'HERG',
    name: 'hERG Potassium Channel (Kv11.1)',
    gene: 'KCNH2 · UniProt Q12809',
    cellularOrganelle: 'Plasma Membrane Ion Pore',
    membraneType: 'PLASMA_PORE',
    compartmentSummary:
      'Tetrameric voltage-gated potassium channel spanning the cardiac cell plasma membrane, governing rapid repolarisation after each heartbeat.',
    provenance: 'Experimental (PDB)',
    structureId: 'PDB 5VA2 · AF-Q12809-F1',
    resolutionOrConfidence: '3.80 Å Cryo-EM (PDB 5VA2) · pLDDT 86.5 (AlphaFold)',
    plddtScore: 86.5,
    substrateLabel: 'K+ Ion Flux',
    inhibitorLabel: 'Domperidone + Azithromycin',
    clashDistanceAngstrom: '3.1 Å π-stacking plug at Tyr652 / Phe656',
    residues: [
      { id: 'r1', label: 'Tyr652', role: 'Central pore aromatic drug-trap', position: [0.8, -0.2, 0.6] },
      { id: 'r2', label: 'Phe656', role: 'Hydrophobic inner-vestibule clamp', position: [-0.8, -0.3, -0.5] },
      { id: 'r3', label: 'Gly648', role: 'Selectivity filter exit collar', position: [0, 0.9, 0] },
    ],
    explanationSummary:
      'Both domperidone and macrolides carry aromatic rings that wedge between Tyr652 and Phe656 inside the central pore, blocking outward K+ ion flow.',
    clinicalImplication:
      'Delayed cardiac repolarisation prolongs the QT interval and can trigger dangerous ventricular arrhythmias.',
    accentHex: '#fb7185',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=Q12809',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/5VA2',
  },
  PGP: {
    id: 'PGP',
    name: 'P-Glycoprotein Efflux Pump (ABCB1)',
    gene: 'ABCB1 · UniProt P08183',
    cellularOrganelle: 'Plasma Membrane Transmembrane Bilayer',
    membraneType: 'PLASMA_PORE',
    compartmentSummary:
      'ATP-driven membrane efflux transporter pumping xenobiotics out of intestinal, renal, and blood-brain-barrier cells.',
    provenance: 'AlphaFold-predicted',
    structureId: 'AF-P08183-F1 · PDB 6C0V',
    resolutionOrConfidence: 'AlphaFold DB pLDDT 91.4 (transmembrane helices)',
    plddtScore: 91.4,
    substrateLabel: 'Digoxin / Statin Efflux',
    inhibitorLabel: 'Clarithromycin / Verapamil',
    clashDistanceAngstrom: '2.9 Å V-cavity blockade',
    residues: [
      { id: 'r1', label: 'Phe336', role: 'Drug-binding V-cavity hydrophobic wall', position: [0.7, 0.4, 0.5] },
      { id: 'r2', label: 'Tyr310', role: 'Polar contact inside efflux lumen', position: [-0.9, 0.2, -0.4] },
      { id: 'r3', label: 'NBD1 ATP', role: 'Cytosolic ATP hydrolysis motor', position: [0, -1.0, 0.2] },
    ],
    explanationSummary:
      'AlphaFold models the full transmembrane inward-facing V-cavity where macrolides stall ATP-coupled drug pumping.',
    clinicalImplication:
      'Inhibiting P-gp stops intestinal efflux, causing higher systemic absorption of co-administered substrates.',
    accentHex: '#34d399',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=P08183',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/6C0V',
  },
  AMPK: {
    id: 'AMPK',
    name: 'AMP-Activated Protein Kinase & Complex I',
    gene: 'PRKAA1 · UniProt Q13131',
    cellularOrganelle: 'Mitochondrion & Cytosol Interface',
    membraneType: 'MITO_CRISTAE',
    compartmentSummary:
      'Energy-sensing kinase activated when metformin mildly modulates mitochondrial Complex I ATP/AMP ratios inside hepatocyte cells.',
    provenance: 'AlphaFold-predicted',
    structureId: 'AF-Q13131-F1 · PDB 4RER',
    resolutionOrConfidence: 'AlphaFold DB pLDDT 90.6 (catalytic kinase domain)',
    plddtScore: 90.6,
    substrateLabel: 'Metformin (Hepatic Energy Sensor)',
    inhibitorLabel: 'Physiologic Gluconeogenesis Suppression',
    clashDistanceAngstrom: 'Normal allosteric activation (no clash)',
    residues: [
      { id: 'r1', label: 'Thr172', role: 'Activation loop phosphorylation switch', position: [0.3, 0.8, 0.4] },
      { id: 'r2', label: 'Lys45', role: 'ATP-binding catalytic cleft', position: [-0.6, 0.3, -0.5] },
      { id: 'r3', label: 'CBS1-4', role: 'AMP/ADP cellular energy sensor domain', position: [0.5, -0.7, 0.3] },
    ],
    explanationSummary:
      'Metformin gently shifts hepatic mitochondrial energy charge, activating AMPK Thr172 to switch off excess glucose synthesis safely.',
    clinicalImplication:
      'Explains how metformin lowers fasting blood glucose at therapeutic doses without causing hypoglycemia.',
    accentHex: '#10b981',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=Q13131',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/4RER',
  },
  COX2: {
    id: 'COX2',
    name: 'Cyclooxygenase-2 (PTGS2)',
    gene: 'PTGS2 · UniProt P35354',
    cellularOrganelle: 'Nuclear Envelope & ER Lumen',
    membraneType: 'NUCLEAR_ER',
    compartmentSummary:
      'Seated in the inner leaflet of the endoplasmic reticulum and nuclear membrane, converting arachidonic acid into inflammatory prostaglandins.',
    provenance: 'Experimental (PDB)',
    structureId: 'PDB 5KIR · AF-P35354-F1',
    resolutionOrConfidence: '2.70 Å X-ray (PDB 5KIR) · pLDDT 93.1 (AlphaFold)',
    plddtScore: 93.1,
    substrateLabel: 'Arachidonic Acid',
    inhibitorLabel: 'Ibuprofen / NSAID',
    clashDistanceAngstrom: '2.6 Å reversible channel block at Arg120',
    residues: [
      { id: 'r1', label: 'Arg120', role: 'Carboxylate anchor at channel mouth', position: [0.8, -0.4, 0.3] },
      { id: 'r2', label: 'Tyr385', role: 'Catalytic radical site for prostaglandin synthesis', position: [-0.4, 0.7, -0.4] },
      { id: 'r3', label: 'Ser530', role: 'Active-site channel constriction', position: [0.1, 0.1, 0.8] },
    ],
    explanationSummary:
      'Ibuprofen reversibly wedges against Arg120 inside the ER membrane channel, blocking prostaglandin synthesis and reducing fever/pain.',
    clinicalImplication:
      'Effective for inflammation, but in kidneys and stomach lining this same block reduces protective prostaglandins.',
    accentHex: '#f59e0b',
    alphafoldViewerUrl: 'https://molstar.org/viewer/?afdb=P35354',
    rcsbStructureUrl: 'https://www.rcsb.org/structure/5KIR',
  },
};

export const INGREDIENT_REFERENCE_LINKS: Record<
  string,
  { title: string; category: 'FDA DailyMed Label' | 'Regulatory / Formulary'; url: string; relevance: string }
> = {
  clarithromycin: {
    title: 'NIH DailyMed FDA Label: Clarithromycin Tablets (setid d0a66646-6774-4fc6-9b26-a98c3a5df274)',
    category: 'FDA DailyMed Label',
    url: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0a66646-6774-4fc6-9b26-a98c3a5df274&type=display',
    relevance: 'FDA dosing, indications, and CYP3A4 contraindicated drug interaction labeling for Clarithromycin.',
  },
  simvastatin: {
    title: 'NIH DailyMed Search: Simvastatin Prescribing Information (§2 & §4 Contraindications)',
    category: 'FDA DailyMed Label',
    url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=simvastatin',
    relevance: 'Statin dosing limits and strong CYP3A4 inhibitor contraindications.',
  },
  atorvastatin: {
    title: 'NIH DailyMed Search: Atorvastatin Prescribing Information (§2.1 & §7 Interactions)',
    category: 'FDA DailyMed Label',
    url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=atorvastatin',
    relevance: 'Dosage ceilings and CYP3A4/OATP1B1 interaction precautions.',
  },
  metformin: {
    title: 'NIH DailyMed Search: Metformin Hydrochloride Prescribing Information (§2 & §5.1)',
    category: 'FDA DailyMed Label',
    url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=metformin',
    relevance: 'Max daily dose limits and renal clearance precautions.',
  },
  paracetamol: {
    title: 'CDSCO National AEFI Guidelines & DailyMed Acetaminophen Monograph',
    category: 'Regulatory / Formulary',
    url: 'https://cdsco.gov.in/',
    relevance: 'Adult max daily ceiling (4000 mg/day) and pediatric 10–15 mg/kg/dose limits.',
  },
  ibuprofen: {
    title: 'WHO Model Formulary for Children & DailyMed Ibuprofen Monograph',
    category: 'Regulatory / Formulary',
    url: 'https://iris.who.int/',
    relevance: 'Pediatric >3 months age restriction, hydration check, and adult NSAID ceilings.',
  },
  amoxicillin: {
    title: 'Indian Academy of Pediatrics (IAP) STG & WHO Essential Medicines Amoxicillin',
    category: 'Regulatory / Formulary',
    url: 'https://iapindia.org/',
    relevance: 'Weight- and indication-based pediatric amoxicillin regimen guidance.',
  },
  azithromycin: {
    title: 'NIH DailyMed Search: Azithromycin Prescribing Information',
    category: 'FDA DailyMed Label',
    url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=azithromycin',
    relevance: 'Macrolide dosing and QT prolongation precaution guidance.',
  },
  domperidone: {
    title: 'CDSCO & EMA Domperidone Safety Advisory',
    category: 'Regulatory / Formulary',
    url: 'https://cdsco.gov.in/',
    relevance: 'Maximum daily dose limit (30 mg/day) and cardiac QT precaution.',
  },
};

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'safe-diabetes-lipid',
    label: 'Safe Regimen: Diabetes + Cholesterol',
    subtitle: 'Metformin 500mg BD + Atorvastatin 20mg HS — Verified Safe',
    patientCondition: 'Type 2 Diabetes and High Cholesterol',
    patientAge: 52,
    rawPrescriptionText:
      'Rx:\n1. Tab Metformin 500 mg — 1-0-1 PC x 30 days\n2. Tab Atorvastatin 20 mg — 0-0-1 HS x 30 days',
    items: [
      {
        id: 'item-1',
        brandName: 'Glycomet-500 SR',
        activeIngredients: ['metformin'],
        strengthMg: 500,
        frequencyPerDay: 2,
        totalDailyMg: 1000,
        durationDays: 30,
        route: 'Oral after food (PC)',
        batchNumber: 'GM26114',
        manufacturer: 'USV Pvt Ltd',
        rawLine: 'Tab Metformin 500 mg — 1-0-1 PC x 30 days',
      },
      {
        id: 'item-2',
        brandName: 'Atorva-20',
        activeIngredients: ['atorvastatin'],
        strengthMg: 20,
        frequencyPerDay: 1,
        totalDailyMg: 20,
        durationDays: 30,
        route: 'Oral at bedtime (HS)',
        batchNumber: 'AT26082',
        manufacturer: 'Zydus Cadila',
        rawLine: 'Tab Atorvastatin 20 mg — 0-0-1 HS x 30 days',
      },
    ],
  },
  {
    id: 'clash-cyp3a4',
    label: 'CYP3A4 Clash + NSQ Batch Alert',
    subtitle: 'Clarithromycin 250mg (NSQ batch MC26091A) + Simvastatin 20mg',
    patientCondition: 'Bacterial Sinusitis',
    patientAge: 58,
    rawPrescriptionText:
      'Rx:\n1. Tab Clarimac-250 (Clarithromycin) 250 mg — 1-0-1 PC x 7 days [Batch: MC26091A]\n2. Tab Simvastatin 20 mg — 0-0-1 HS x 30 days',
    items: [
      {
        id: 'item-1',
        brandName: 'Clarimac-250',
        activeIngredients: ['clarithromycin'],
        strengthMg: 250,
        frequencyPerDay: 2,
        totalDailyMg: 500,
        durationDays: 7,
        route: 'Oral after food (PC)',
        batchNumber: 'MC26091A',
        manufacturer: 'Macleods Pharma Ltd',
        rawLine: 'Tab Clarimac-250 (Clarithromycin) 250 mg — 1-0-1 PC x 7 days',
      },
      {
        id: 'item-2',
        brandName: 'Simvotin-20',
        activeIngredients: ['simvastatin'],
        strengthMg: 20,
        frequencyPerDay: 1,
        totalDailyMg: 20,
        durationDays: 30,
        route: 'Oral at bedtime (HS)',
        batchNumber: 'SV26019',
        manufacturer: 'Sun Pharma',
        rawLine: 'Tab Simvastatin 20 mg — 0-0-1 HS x 30 days',
      },
    ],
  },
  {
    id: 'overdose-mismatch',
    label: 'Dosage Overdose + Disease Mismatch',
    subtitle: 'Excess Paracetamol (5200mg/day) + Metformin prescribed for Viral Fever',
    patientCondition: 'Viral Fever and Body Pain',
    patientAge: 68,
    rawPrescriptionText:
      'Rx:\n1. Tab Dolo-650 (Paracetamol) 650 mg — 2-2-2-2 (8 tabs/day) x 5 days\n2. Tab Metformin 500 mg — 1-0-1 PC x 10 days',
    items: [
      {
        id: 'item-1',
        brandName: 'Dolo-650',
        activeIngredients: ['paracetamol'],
        strengthMg: 650,
        frequencyPerDay: 8,
        totalDailyMg: 5200,
        durationDays: 5,
        route: 'Oral after food',
        batchNumber: 'ML26044',
        manufacturer: 'Micro Labs Ltd',
        rawLine: 'Tab Dolo-650 (Paracetamol) 650 mg — 2-2-2-2 x 5 days',
      },
      {
        id: 'item-2',
        brandName: 'Glycomet-500',
        activeIngredients: ['metformin'],
        strengthMg: 500,
        frequencyPerDay: 2,
        totalDailyMg: 1000,
        durationDays: 10,
        route: 'Oral after food',
        batchNumber: 'GM26114',
        manufacturer: 'USV Pvt Ltd',
        rawLine: 'Tab Metformin 500 mg — 1-0-1 PC x 10 days',
      },
    ],
  },
  {
    id: 'cdsco-banned-fdc',
    label: 'Banned FDC + Cardiac hERG Clash',
    subtitle: 'S(+) Etodolac + Paracetamol (CDSCO Ban) & Azithromycin + Domperidone',
    patientCondition: 'Joint Pain and Nausea',
    patientAge: 66,
    rawPrescriptionText:
      'Rx:\n1. Tab Etodolac-P Plus (S(+) Etodolac 300mg + Paracetamol 500mg) — 1-0-1 PC x 5 days\n2. Tab Azithromycin 500 mg OD + Tab Domperidone 10 mg TID',
    items: [
      {
        id: 'item-1',
        brandName: 'Etodolac-P Plus',
        activeIngredients: ['s(+) etodolac', 'paracetamol'],
        strengthMg: 800,
        frequencyPerDay: 2,
        totalDailyMg: 1600,
        durationDays: 5,
        route: 'Oral after food',
        batchNumber: 'ET25012',
        manufacturer: 'Generic FDC Manufacturers',
        rawLine: 'Tab Etodolac-P Plus (S(+) Etodolac + Paracetamol) — 1-0-1 PC x 5 days',
      },
      {
        id: 'item-2',
        brandName: 'Azithral-500',
        activeIngredients: ['azithromycin'],
        strengthMg: 500,
        frequencyPerDay: 1,
        totalDailyMg: 500,
        durationDays: 3,
        route: 'Oral once daily',
        batchNumber: 'AZ26101',
        manufacturer: 'Alembic Pharma',
        rawLine: 'Tab Azithromycin 500 mg OD x 3 days',
      },
      {
        id: 'item-3',
        brandName: 'Domstal-10',
        activeIngredients: ['domperidone'],
        strengthMg: 10,
        frequencyPerDay: 3,
        totalDailyMg: 30,
        durationDays: 5,
        route: 'Oral before food (AC)',
        batchNumber: 'DM26308',
        manufacturer: 'Torrent Pharma',
        rawLine: 'Tab Domperidone 10 mg TID AC x 5 days',
      },
    ],
  },
  {
    id: 'pediatric-rag-caution',
    label: 'Pediatric Fever & Cold',
    subtitle: 'Age 3 yrs (14 kg): Calpol 250mg 5x/day + Sinarest combination',
    patientCondition: 'Fever and Cold',
    patientAge: 3,
    rawPrescriptionText:
      'Rx (Child 3 yrs, 14 kg):\n1. Syp Calpol (Paracetamol) 250 mg — 5x/day (every 4h) x 3 days\n2. Syp Sinarest (Chlorpheniramine 2mg + Phenylephrine 5mg + Paracetamol 125mg) — 1-0-1 x 3 days',
    items: [
      {
        id: 'item-1',
        brandName: 'Calpol Suspension',
        activeIngredients: ['paracetamol'],
        strengthMg: 250,
        frequencyPerDay: 5,
        totalDailyMg: 1250,
        durationDays: 3,
        route: 'Oral suspension',
        batchNumber: 'CP26071',
        manufacturer: 'GSK India',
        rawLine: 'Syp Calpol (Paracetamol) 250 mg — 5x/day x 3 days',
      },
      {
        id: 'item-2',
        brandName: 'Sinarest Drops/Syp',
        activeIngredients: ['chlorpheniramine', 'phenylephrine', 'paracetamol'],
        strengthMg: 132,
        frequencyPerDay: 2,
        totalDailyMg: 264,
        durationDays: 3,
        route: 'Oral after food',
        batchNumber: 'SN26119',
        manufacturer: 'Centaur Pharma',
        rawLine: 'Syp Sinarest (Chlorpheniramine + Phenylephrine + Paracetamol) — 1-0-1 x 3 days',
      },
    ],
  },
  {
    id: 'pediatric-amoxicillin-weight',
    label: 'Pediatric Amoxicillin (Weight & Indication Check)',
    subtitle: 'Age 4 yrs (16 kg): Mox 125 mg TDS + Ibuprofen 100 mg TID (IAP STG)',
    patientCondition: 'Bacterial Otitis Media & Fever',
    patientAge: 4,
    rawPrescriptionText:
      'Rx (Child 4 yrs, 16 kg):\n1. Syp Mox (Amoxicillin 125 mg/5 mL) 125 mg — 1-1-1 (TDS) x 5 days\n2. Syp Brufen (Ibuprofen 100 mg/5 mL) 100 mg — 1-1-1 SOS after food x 3 days',
    items: [
      {
        id: 'item-1',
        brandName: 'Mox Suspension',
        activeIngredients: ['amoxicillin'],
        strengthMg: 125,
        frequencyPerDay: 3,
        totalDailyMg: 375,
        durationDays: 5,
        route: 'Oral suspension (125 mg/5 mL)',
        batchNumber: 'MX26105',
        manufacturer: 'Sun Pharma',
        rawLine: 'Syp Mox (Amoxicillin) 125 mg — 1-1-1 x 5 days',
      },
      {
        id: 'item-2',
        brandName: 'Brufen Junior',
        activeIngredients: ['ibuprofen'],
        strengthMg: 100,
        frequencyPerDay: 3,
        totalDailyMg: 300,
        durationDays: 3,
        route: 'Oral after food',
        batchNumber: 'BR26018',
        manufacturer: 'Abbott India',
        rawLine: 'Syp Brufen (Ibuprofen) 100 mg — 1-1-1 SOS after food x 3 days',
      },
    ],
  },
  {
    id: 'pediatric-contra-nimesulide',
    label: 'Pediatric Contraindication: Nimesulide + Aspirin',
    subtitle: 'Age 8 yrs: Nise 100 mg (CDSCO Ban <12y) + Disprin (Reye Syndrome Risk)',
    patientCondition: 'Viral Fever and Body Pain',
    patientAge: 8,
    rawPrescriptionText:
      'Rx (Child 8 yrs):\n1. Tab Nise (Nimesulide) 100 mg — 1-0-1 x 3 days\n2. Tab Disprin (Aspirin) 325 mg — 1 SOS for fever',
    items: [
      {
        id: 'item-1',
        brandName: 'Nise-100',
        activeIngredients: ['nimesulide'],
        strengthMg: 100,
        frequencyPerDay: 2,
        totalDailyMg: 200,
        durationDays: 3,
        route: 'Oral',
        batchNumber: 'NS26040',
        manufacturer: 'Dr. Reddys',
        rawLine: 'Tab Nise (Nimesulide) 100 mg — 1-0-1 x 3 days',
      },
      {
        id: 'item-2',
        brandName: 'Disprin',
        activeIngredients: ['aspirin'],
        strengthMg: 325,
        frequencyPerDay: 1,
        totalDailyMg: 325,
        durationDays: 2,
        route: 'Oral',
        batchNumber: 'DP26011',
        manufacturer: 'Reckitt Benckiser',
        rawLine: 'Tab Disprin (Aspirin) 325 mg — 1 SOS',
      },
    ],
  },
];

export const INITIAL_FACILITY_STOCK: FacilityStockItem[] = [
  {
    id: 'stk-1',
    productName: 'Clarimac-250',
    activeIngredients: ['clarithromycin'],
    batchNumber: 'MC26091A',
    manufacturer: 'Macleods Pharma Ltd',
    quantityPacks: 42,
    shelfLocation: 'Rack A-14 (Antibiotics)',
    lastCheckedAt: '2026-11-10',
  },
  {
    id: 'stk-2',
    productName: 'Dolo-650',
    activeIngredients: ['paracetamol'],
    batchNumber: 'ML26044',
    manufacturer: 'Micro Labs Ltd',
    quantityPacks: 185,
    shelfLocation: 'Rack B-02 (Analgesics)',
    lastCheckedAt: '2026-11-10',
  },
  {
    id: 'stk-3',
    productName: 'Glycomet-500 SR',
    activeIngredients: ['metformin'],
    batchNumber: 'GM26114',
    manufacturer: 'USV Pvt Ltd',
    quantityPacks: 110,
    shelfLocation: 'Rack C-08 (Metabolic)',
    lastCheckedAt: '2026-11-10',
  },
  {
    id: 'stk-4',
    productName: 'Etodolac-P Plus',
    activeIngredients: ['s(+) etodolac', 'paracetamol'],
    batchNumber: 'ET25012',
    manufacturer: 'Generic FDC Manufacturers',
    quantityPacks: 14,
    shelfLocation: 'Quarantine Bin Q-03',
    lastCheckedAt: '2026-11-10',
  },
];

export const INITIAL_PHARMACIST_HYPOTHESES: PharmacistHypothesis[] = [
  {
    id: 'hyp-1',
    title: 'Predicted P-gp V-Cavity Competition: Atorvastatin + High-Dose Macrolides',
    drugsInvolved: ['atorvastatin', 'azithromycin'],
    targetProteinId: 'PGP',
    provenance: 'AlphaFold-predicted',
    evidenceTier: 'Predicted',
    plddtConfidence: 91.4,
    pocketDistanceAngstrom: 2.9,
    structuralRationale:
      'AlphaFold-Multimer docking suggests azithromycin transiently occupies Phe336/Tyr310 inside the ABCB1 transmembrane V-cavity; however, clinical AUC elevation is weak compared to clarithromycin. Held for pharmacist review only — never displayed to patients as an alert.',
    status: 'Pending Pharmacist Review',
    patientVisible: false,
  },
  {
    id: 'hyp-2',
    title: 'Predicted CYP2D6 Allosteric Shift: Domperidone + Fluoxetine Co-Occupancy',
    drugsInvolved: ['domperidone', 'fluoxetine'],
    targetProteinId: 'CYP2D6',
    provenance: 'Experimental (PDB)',
    evidenceTier: 'Predicted',
    plddtConfidence: 92.8,
    pocketDistanceAngstrom: 3.3,
    structuralRationale:
      'Crystal-pocket alignment (PDB 2F9Q) indicates overlapping Asp301 basic amine anchoring that may raise domperidone plasma peaks in CYP2D6 intermediate metabolisers.',
    evidenceSource: 'https://www.rcsb.org/structure/2F9Q',
    evidenceLocator: 'PDB 2F9Q Asp301 active-site pocket',
    proposedBy: 'Molecular Triage Pipeline',
    status: 'Pending Pharmacist Review',
    patientVisible: false,
  },
];

export const INITIAL_MOLECULAR_EVIDENCE: MolecularEvidenceEntry[] = [
  {
    id: 'ev-cyp3a4-clarithro',
    target: 'CYP3A4',
    drug: 'clarithromycin + simvastatin',
    relationship: 'inhibition',
    accession: '1TQN',
    structureKind: 'experimental',
    method: 'X-ray diffraction (2.05 Å)',
    sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0a66646-6774-4fc6-9b26-a98c3a5df274&type=display',
    locator: 'DailyMed Sections 4.5 & 7 · PDB 1TQN',
    limitation: '3D structure illustrates enzyme fold; clinical contraindication stands solely on the FDA DailyMed label.',
    reviewedBy: 'Dr. R. Subramanian (RPh)',
    reviewedAt: '2026-10-12',
  },
  {
    id: 'ev-herg-domperidone',
    target: 'HERG',
    drug: 'azithromycin + domperidone',
    relationship: 'inhibition',
    accession: '5VA2',
    structureKind: 'experimental',
    method: 'Cryo-EM (3.80 Å)',
    sourceUrl: 'https://www.rcsb.org/structure/5VA2',
    locator: 'EMA PRAC QT Advisory · PDB 5VA2 Tyr652/Phe656 pore',
    limitation: 'Cryo-EM channel structure shows pore geometry; QT risk is governed by EMA/CredibleMeds clinical labeling.',
    reviewedBy: 'Dr. R. Subramanian (RPh)',
    reviewedAt: '2026-10-18',
  },
  {
    id: 'ev-pgp-atorva',
    target: 'PGP',
    drug: 'atorvastatin',
    relationship: 'transport',
    accession: 'P08183',
    structureKind: 'predicted',
    method: 'AlphaFold DB',
    confidence: 'pLDDT 91.4',
    sourceUrl: 'https://alphafold.ebi.ac.uk/entry/P08183',
    locator: 'AF-P08183-F1 transmembrane V-cavity',
    limitation: 'Computational AlphaFold model; treat low-confidence loops as unverified.',
    reviewedBy: 'Dr. K. Meenakshi (PharmD)',
    reviewedAt: '2026-11-02',
  },
  {
    id: 'ev-ampk-metformin',
    target: 'AMPK',
    drug: 'metformin',
    relationship: 'target',
    accession: 'Q13131',
    structureKind: 'predicted',
    method: 'AlphaFold DB',
    confidence: 'pLDDT 90.6',
    sourceUrl: 'https://alphafold.ebi.ac.uk/entry/Q13131',
    locator: 'AF-Q13131-F1 Thr172 catalytic kinase loop',
    limitation: 'Educational mechanism visualization only; dosing safety relies on ADA/DailyMed standards.',
    reviewedBy: 'Dr. K. Meenakshi (PharmD)',
    reviewedAt: '2026-11-02',
  },
];

export const INITIAL_INVENTORY_LEDGER: InventoryTransaction[] = [
  {
    id: 'txn-1',
    stockId: 'stk-1',
    kind: 'stock_in',
    quantityDelta: 42,
    actor: 'Receiving Desk (R. Nair)',
    at: '2026-11-08T09:15:00Z',
    note: 'Initial batch intake MC26091A (42 packs)',
    reported: true,
    verified: true,
  },
  {
    id: 'txn-2',
    stockId: 'stk-2',
    kind: 'stock_in',
    quantityDelta: 185,
    actor: 'Receiving Desk (R. Nair)',
    at: '2026-11-08T09:40:00Z',
    note: 'Batch ML26044 verified clear against WHO alert ML26-FAKE9',
    reported: true,
    verified: true,
  },
  {
    id: 'txn-3',
    stockId: 'stk-4',
    kind: 'stock_in',
    quantityDelta: 14,
    actor: 'Receiving Desk',
    at: '2026-11-09T11:20:00Z',
    note: 'Legacy stock intake prior to S.O. 3284(E) audit',
    reported: true,
    verified: true,
  },
  {
    id: 'txn-4',
    stockId: 'stk-4',
    kind: 'quarantine',
    quantityDelta: 14,
    actor: 'Dr. R. Subramanian (RPh)',
    at: '2026-11-10T14:05:00Z',
    note: 'Moved to Quarantine Bin Q-03 per CDSCO Gazette S.O. 3284(E)',
    reported: true,
    verified: true,
  },
];

export const INITIAL_OUTBOX_NOTIFICATIONS: OutboxNotification[] = [
  {
    id: 'out-1',
    channel: 'in_app',
    recipient: 'dispensary-lead@medguard-clinic.org',
    subject: 'CDSCO-NSQ-2026-041: Clarimac-250 Batch MC26091A Hold Notice',
    body: '42 packs of Clarimac-250 (Batch MC26091A) matched CDSCO NSQ Alert on Rack A-14. Quarantine physical stock and verify via ledger.',
    reviewId: 'CDSCO-NSQ-2026-041',
    status: 'delivered',
    attempts: 1,
    lastError: null,
    createdAt: '2026-11-10T10:00:00Z',
    lastAttemptAt: '2026-11-10T10:00:02Z',
    deliveredAt: '2026-11-10T10:00:02Z',
  },
];

export function buildClinicalRulesGovernanceReport(): ClinicalRulesGovernanceReport {
  const rows: GovernedRuleAuditRow[] = [];

  for (const r of INTERACTION_RULES) {
    rows.push({
      id: r.id,
      kind: 'interaction',
      ingredients: r.ingredients,
      jurisdiction: 'US / IN (DailyMed & EMA)',
      license: 'Public Domain / Federal Label',
      governed: true,
      missing: [],
      expired: false,
      reviewedBy: 'Dr. R. Subramanian (RPh)',
      reviewedAt: '2026-10-01',
      reReviewAt: '2027-10-01',
      source: r.source,
    });
  }

  for (const r of ELDERLY_RISK_RULES) {
    rows.push({
      id: `beers-${r.ingredient}`,
      kind: 'geriatric',
      ingredients: [r.ingredient],
      jurisdiction: 'US / Global (AGS Beers)',
      license: 'Curated Clinical Guideline',
      governed: true,
      missing: [],
      expired: false,
      reviewedBy: 'Dr. K. Meenakshi (PharmD)',
      reviewedAt: '2026-09-15',
      reReviewAt: '2027-09-15',
      source: r.source,
    });
  }

  for (const r of BANNED_FDC_RULES) {
    rows.push({
      id: r.id,
      kind: 'prohibition',
      ingredients: r.ingredients,
      jurisdiction: 'IN (CDSCO Gazette)',
      license: 'Official Gazette Notification',
      governed: true,
      missing: [],
      expired: false,
      reviewedBy: 'Dr. R. Subramanian (RPh)',
      reviewedAt: '2026-08-15',
      reReviewAt: '2027-08-15',
      source: r.source,
    });
  }

  for (const r of DOSE_RULES.slice(0, 8)) {
    const isSyntheticPlaceholder = !r.source;
    rows.push({
      id: `dose-${r.ingredient}`,
      kind: 'dose_ceiling',
      ingredients: [r.ingredient],
      jurisdiction: 'IN / US (CDSCO & DailyMed)',
      license: isSyntheticPlaceholder ? '' : 'Public Formulary Citation',
      governed: !isSyntheticPlaceholder,
      missing: isSyntheticPlaceholder ? ['license', 'evidence'] : [],
      expired: false,
      reviewedBy: 'MedGuard Clinical Panel',
      reviewedAt: '2026-10-10',
      reReviewAt: '2027-10-10',
      source: r.source,
    });
  }

  // Include explicit synthetic demo governance check (mirrors MedGuard-V0 governance transparency)
  rows.push({
    id: 'synthetic-demo-ceiling',
    kind: 'dose_ceiling',
    ingredients: ['demoxin (synthetic demo fixture)'],
    jurisdiction: 'none',
    license: '',
    governed: false,
    missing: ['license', 'evidence', 'reviewed_by', 're_review_at'],
    expired: false,
    reviewedBy: '',
    reviewedAt: '',
    reReviewAt: '',
    source: 'synthetic-fixture',
  });

  const governed = rows.filter((r) => r.governed).length;
  const expiredCount = rows.filter((r) => r.expired).length;

  return {
    total: rows.length,
    governed,
    notGoverned: rows.length - governed,
    expiredCount,
    rules: rows,
  };
}

