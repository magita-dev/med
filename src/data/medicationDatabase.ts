import type {
  MechanismTargetId,
  RagActionCode,
  RagClinicalRecord,
  RagSafetyStatus,
} from '../types/medguard.ts';

export interface MedicationRagSource {
  id: string;
  name: string;
  scope: string;
  url: string;
  evidenceLevel: 'Verified' | 'Curated';
}

export interface MedicationRagEntry extends RagClinicalRecord {
  medicine_name: string;
  patient_group: 'pediatric' | 'adult' | 'elderly' | 'all';
  reference_dose: string;
  safety_status: RagSafetyStatus;
  source: string;
  active_ingredient: string;
  brand_examples: string[];
  age_range: string;
  weight_guidance: string;
  route: string;
  frequency: string;
  maximum: string;
  contraindications: string[];
  interactions: string[];
  mechanism_target_id: MechanismTargetId;
  action: RagActionCode;
  reason: string;
  recommended_action: string[];
  source_url: string;
  evidence_level: 'Verified' | 'Curated';
  requires_weight_check: boolean;
  requires_formulation_check: boolean;
}

export const CLINICAL_RAG_SOURCES: MedicationRagSource[] = [
  {
    id: 'cdsco-aefi',
    name: 'CDSCO – National AEFI Guidelines & Gazette Notices',
    scope:
      'Pediatric paracetamol 125 mg/5 mL table (10–15 mg/kg/dose, max 4 doses/24h), Nimesulide <12y prohibition, Chlorpheniramine + Phenylephrine <4y restriction.',
    url: 'https://cdsco.gov.in/',
    evidenceLevel: 'Verified',
  },
  {
    id: 'iap-stg',
    name: 'Indian Academy of Pediatrics (IAP) – Standard Treatment Guidelines',
    scope:
      'Weight- and indication-specific pediatric clinical dosing across common Indian outpatient infections, allergies, and fever.',
    url: 'https://iapindia.org/',
    evidenceLevel: 'Curated',
  },
  {
    id: 'who-mfc',
    name: 'WHO Model Formulary for Children',
    scope:
      'Authoritative pediatric age/weight restrictions (e.g., Ibuprofen contraindicated <3 months, Metoclopramide <1 year restriction).',
    url: 'https://iris.who.int/',
    evidenceLevel: 'Curated',
  },
  {
    id: 'who-pocketbook',
    name: 'WHO Pocket Book of Hospital Care for Children',
    scope:
      'Comprehensive pediatric clinical dosing, contraindications, and supportive care safeguards.',
    url: 'https://www.who.int/',
    evidenceLevel: 'Curated',
  },
];

export const MEDICATION_RAG_DATABASE: MedicationRagEntry[] = [
  // 1. Paracetamol / Crocin / Calpol
  {
    id: 'rag-paracetamol-ref',
    medicine_name: 'Paracetamol',
    brand_examples: ['Crocin', 'Calpol', 'Dolo', 'P-125', 'P-250'],
    active_ingredient: 'paracetamol',
    patient_group: 'pediatric',
    age_range: '6 weeks–6 years (weight-based up to 18 years)',
    min_age_months: 1.5,
    max_age_years: 18,
    weight_guidance: '10–15 mg/kg/dose (125 mg/5 mL suspension for 6 wks–6 yrs)',
    reference_dose: '10–15 mg/kg/dose',
    mg_per_kg_min: 10,
    mg_per_kg_max: 15,
    max_doses_per_day: 4,
    route: 'oral',
    frequency: 'Every 4–6 hours when indicated',
    maximum: 'Maximum 4 doses/24 hours in the cited CDSCO vaccination guidance',
    contraindications: ['Severe hepatic impairment', 'Known paracetamol hypersensitivity'],
    interactions: ['Duplicate paracetamol in cough/cold FDCs', 'Warfarin (high prolonged dose)'],
    mechanism_target_id: 'COX2',
    safety_status: 'REFERENCE',
    action: 'REFERENCE_CHECK',
    reason:
      'Pediatric dosing must be calculated from body weight (10–15 mg/kg/dose) and verified against oral drop vs suspension (125 mg/5 mL or 250 mg/5 mL) strength.',
    recommended_action: [
      "Verify patient's weight (kg)",
      'Verify formulation strength (100 mg/mL drops vs 125 mg/5 mL vs 250 mg/5 mL vs adult tablet)',
      'Verify dose per administration (10–15 mg/kg/dose)',
      'Verify dosing interval (every 4–6h, max 4 doses/24h)',
    ],
    source: 'CDSCO - National AEFI Guidelines',
    source_url: 'https://cdsco.gov.in/',
    evidence_level: 'Verified',
    requires_weight_check: true,
    requires_formulation_check: true,
  },
  {
    id: 'rag-paracetamol-unsafe',
    medicine_name: 'Paracetamol',
    brand_examples: ['Crocin', 'Calpol', 'Dolo-650'],
    active_ingredient: 'paracetamol',
    patient_group: 'pediatric',
    age_range: 'Under 18 years',
    max_age_years: 18,
    weight_guidance:
      '10–15 mg/kg/dose; adult fixed 500–650 mg tablets or >4 doses/24h risk hepatotoxicity',
    reference_dose: '10–15 mg/kg/dose (max 4 doses/24h)',
    mg_per_kg_min: 10,
    mg_per_kg_max: 15,
    max_doses_per_day: 4,
    route: 'oral',
    frequency: 'Exceeds >4 doses/24h or fixed adult tablet strength',
    maximum: 'Maximum 4 doses/24 hours (max 60 mg/kg/day)',
    contraindications: ['Co-administration with other paracetamol-containing cold remedies'],
    interactions: ['Duplicate paracetamol FDCs (Sinarest / Etodolac-P)'],
    mechanism_target_id: 'COX2',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Dose exceeds recommended pediatric dosing or lacks weight/formulation check',
    reason:
      'Pediatric dosing must be calculated using body weight and formulation strength; excessive dose or >4 doses/24h risks hepatic injury.',
    recommended_action: [
      "Verify patient's weight (kg)",
      'Verify formulation strength (mL / mg per 5 mL)',
      'Verify dose per administration and confirm no duplicate paracetamol FDCs',
      'Verify dosing interval (≥4–6 hours apart, max 4 doses/24h)',
    ],
    source: 'CDSCO - National AEFI Guidelines',
    source_url: 'https://cdsco.gov.in/',
    evidence_level: 'Verified',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 2. Ibuprofen / Brufen
  {
    id: 'rag-ibuprofen-ref',
    medicine_name: 'Ibuprofen',
    brand_examples: ['Brufen', 'Ibugesic'],
    active_ingredient: 'ibuprofen',
    patient_group: 'pediatric',
    age_range: '>3 months–18 years (NOT for infants <3 months)',
    min_age_months: 3,
    max_age_years: 18,
    weight_guidance: '5–10 mg/kg/dose based on age, weight, and hydration status',
    reference_dose: '5–10 mg/kg/dose',
    mg_per_kg_min: 5,
    mg_per_kg_max: 10,
    max_doses_per_day: 4,
    route: 'oral (after food/milk)',
    frequency: 'Every 6–8 hours when indicated',
    maximum: 'Maximum 30–40 mg/kg/day; contraindicated under 3 months',
    contraindications: [
      'Age under 3 months',
      'Dehydration / dengue / suspected varicella',
      'Active GI bleed or renal impairment',
    ],
    interactions: ['Other NSAIDs (Diclofenac, Aspirin)', 'Corticosteroids', 'Nephrotoxic agents'],
    mechanism_target_id: 'COX2',
    safety_status: 'REFERENCE',
    action: 'REFERENCE_CHECK',
    reason:
      'Pediatric ibuprofen is age- and weight-dependent; WHO formulary notes it is not for children under 3 months and requires hydration screening.',
    recommended_action: [
      'Confirm child age >3 months and verify weight (kg)',
      'Assess hydration status (avoid in vomiting/dehydration or suspected dengue)',
      'Verify suspension strength (100 mg/5 mL) and dosing interval (6–8h)',
    ],
    source: 'WHO Model Formulary for Children',
    source_url: 'https://iris.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },
  {
    id: 'rag-ibuprofen-unsafe',
    medicine_name: 'Ibuprofen',
    brand_examples: ['Brufen', 'Ibugesic'],
    active_ingredient: 'ibuprofen',
    patient_group: 'pediatric',
    age_range: 'Under 3 months or unverified weight/hydration',
    max_age_years: 18,
    weight_guidance: '5–10 mg/kg/dose; do not treat as universally safe in children',
    reference_dose: '5–10 mg/kg/dose (avoid <3 months)',
    mg_per_kg_min: 5,
    mg_per_kg_max: 10,
    max_doses_per_day: 4,
    route: 'oral',
    frequency: 'Requires weight, age, and hydration confirmation',
    maximum: '40 mg/kg/day max; contraindicated <3 months',
    contraindications: [
      'Infants <3 months',
      'Dehydration / Dengue hemorrhagic risk',
      'Renal hypoperfusion',
    ],
    interactions: ['Diclofenac / Aspirin (dual COX blockade)', 'Furosemide / Aminoglycosides'],
    mechanism_target_id: 'COX2',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario:
      'Pediatric use without verified age (>3 mo), weight, hydration, or contraindication check',
    reason:
      'Do not treat ibuprofen as universally safe for children; COX-1/COX-2 inhibition during dehydration increases acute kidney injury and GI risk.',
    recommended_action: [
      'Confirm age >3 months and check body weight',
      'Rule out dehydration, dengue fever, or concurrent NSAIDs',
      'Confirm clinician direction and formulation strength',
    ],
    source: 'WHO Model Formulary for Children',
    source_url: 'https://iris.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 3. Aspirin
  {
    id: 'rag-aspirin-unsafe',
    medicine_name: 'Aspirin',
    brand_examples: ['Ecosprin', 'Disprin'],
    active_ingredient: 'aspirin',
    patient_group: 'pediatric',
    age_range: 'Under 18 years (Specialist indication ONLY)',
    max_age_years: 18,
    weight_guidance: 'High-risk in pediatrics; do not recommend routinely to children',
    reference_dose: 'Specialist pediatric indication only (e.g., Kawasaki disease / JIA)',
    route: 'oral',
    frequency: 'Specialist supervision only',
    maximum: 'Contraindicated for routine pediatric fever/viral illness',
    contraindications: [
      'Children/adolescents with viral fever (Reye syndrome risk)',
      'Active bleeding disorders',
      'Dengue',
    ],
    interactions: ['Ibuprofen', 'Diclofenac', 'Anticoagulants'],
    mechanism_target_id: 'COX2',
    safety_status: 'CONTRAINDICATED',
    action: 'CONTRAINDICATED_STOP',
    scenario: 'Routine or unverified pediatric aspirin use',
    reason:
      "Aspirin in children and adolescents is associated with life-threatening Reye's syndrome during viral infections and requires specialist indication.",
    recommended_action: [
      'Do NOT administer routinely for pediatric fever or viral pain',
      'Verify specialist indication (e.g., Kawasaki disease / pediatric cardiology)',
      'Consult pediatrician immediately for safer antipyretic alternative',
    ],
    source: 'WHO Pocket Book of Hospital Care for Children',
    source_url: 'https://www.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 4. Amoxicillin
  {
    id: 'rag-amoxicillin-ref',
    medicine_name: 'Amoxicillin',
    brand_examples: ['Mox', 'Novamox', 'Augmentin'],
    active_ingredient: 'amoxicillin',
    patient_group: 'pediatric',
    age_range: '1 month–18 years',
    min_age_months: 1,
    max_age_years: 18,
    weight_guidance:
      '25–45 mg/kg/day (up to 80–90 mg/kg/day for severe otitis/pneumonia per IAP)',
    reference_dose: '25–45 mg/kg/day in 2–3 divided doses',
    mg_per_kg_min: 20,
    mg_per_kg_max: 90,
    max_doses_per_day: 3,
    route: 'oral',
    frequency: 'Every 8–12 hours depending on indication',
    maximum: 'Never exceed 3000 mg/day or use fixed adult dose blindly in children',
    contraindications: ['Penicillin / beta-lactam anaphylaxis', 'Infectious mononucleosis'],
    interactions: ['Methotrexate', 'Oral anticoagulants'],
    mechanism_target_id: 'PGP',
    safety_status: 'REFERENCE',
    action: 'REFERENCE_CHECK',
    reason:
      'Pediatric amoxicillin dosing depends strictly on clinical indication and body weight; fixed adult tablets must never be given routinely to young children.',
    recommended_action: [
      'Verify confirmed bacterial indication and patient weight (kg)',
      'Verify suspension formulation (125 mg/5 mL or 250 mg/5 mL) vs fixed adult tablet',
      'Confirm divided dosing schedule (BD or TDS) and full course duration',
    ],
    source: 'Indian Academy of Pediatrics (IAP) – Standard Treatment Guidelines',
    source_url: 'https://iapindia.org/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },
  {
    id: 'rag-amoxicillin-unsafe',
    medicine_name: 'Amoxicillin',
    brand_examples: ['Mox 500', 'Augmentin 625'],
    active_ingredient: 'amoxicillin',
    patient_group: 'pediatric',
    age_range: 'Under 18 years',
    max_age_years: 18,
    weight_guidance:
      'Never use a fixed adult 500 mg / 875 mg dose for a child without weight check',
    reference_dose: 'Indication & weight-dependent (25–90 mg/kg/day)',
    mg_per_kg_min: 20,
    mg_per_kg_max: 90,
    max_doses_per_day: 3,
    route: 'oral',
    frequency: 'Fixed adult dose or unverified weight in child',
    maximum: 'Must be weight-titrated in mg/kg/day',
    contraindications: ['Penicillin allergy', 'Viral upper respiratory infection'],
    interactions: ['Allopurinol (rash)', 'Methotrexate'],
    mechanism_target_id: 'PGP',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Fixed adult antibiotic dose or unverified weight/indication in pediatric patient',
    reason:
      'Never use a fixed adult dose for a child; pediatric amoxicillin dosing is indication- and weight-dependent.',
    recommended_action: [
      "Verify patient's weight (kg) and exact bacterial diagnosis",
      'Confirm pediatric suspension/dispersible strength instead of adult capsule',
      'Calculate total mg/kg/day with prescribing pediatrician',
    ],
    source: 'Indian Academy of Pediatrics (IAP) – Standard Treatment Guidelines',
    source_url: 'https://iapindia.org/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 5. Azithromycin
  {
    id: 'rag-azithromycin-ref',
    medicine_name: 'Azithromycin',
    brand_examples: ['Azithral', 'Azee'],
    active_ingredient: 'azithromycin',
    patient_group: 'pediatric',
    age_range: '6 months–18 years',
    min_age_months: 6,
    max_age_years: 18,
    weight_guidance: '10 mg/kg once daily (or 10–20 mg/kg for typhoid per IAP STG)',
    reference_dose: '10 mg/kg/day once daily (max 500 mg/day)',
    mg_per_kg_min: 10,
    mg_per_kg_max: 20,
    max_doses_per_day: 1,
    route: 'oral',
    frequency: 'Once daily for 3–5 days',
    maximum:
      '500 mg/day adult cap; check weight & suspension strength (100 mg/5 mL or 200 mg/5 mL)',
    contraindications: ['QT prolongation / congenital arrhythmia', 'Macrolide hypersensitivity'],
    interactions: ['Domperidone (hERG QT prolongation)', 'Ondansetron', 'CYP3A4/P-gp substrates'],
    mechanism_target_id: 'HERG',
    safety_status: 'REFERENCE',
    action: 'REFERENCE_CHECK',
    reason:
      'Pediatric azithromycin dosing depends on indication, body weight, and suspension strength (100 vs 200 mg/5 mL).',
    recommended_action: [
      'Verify bacterial indication, patient weight (kg), and suspension strength',
      'Check for concurrent QT-prolonging drugs (e.g., Domperidone)',
      'Verify once-daily dosing interval',
    ],
    source: 'Indian Academy of Pediatrics (IAP) – Standard Treatment Guidelines',
    source_url: 'https://iapindia.org/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },
  {
    id: 'rag-azithromycin-unsafe',
    medicine_name: 'Azithromycin',
    brand_examples: ['Azithral-500', 'Azee-500'],
    active_ingredient: 'azithromycin',
    patient_group: 'pediatric',
    age_range: 'Under 18 years',
    max_age_years: 18,
    weight_guidance: '10 mg/kg/day; adult 500 mg tablet risks overdose in children <45 kg',
    reference_dose: '10 mg/kg/day (max 500 mg/day)',
    mg_per_kg_min: 10,
    mg_per_kg_max: 20,
    max_doses_per_day: 1,
    route: 'oral',
    frequency: 'Adult 500 mg dose or unverified weight/formulation in child',
    maximum: '10–20 mg/kg/day; never exceed 500 mg/day',
    contraindications: ['Concurrent Domperidone (cardiac hERG QT clash)', 'Unverified viral fever'],
    interactions: ['Domperidone', 'Digoxin (P-gp efflux blockade)'],
    mechanism_target_id: 'HERG',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario:
      'Pediatric azithromycin regimen missing weight/formulation verification or exceeding 10–20 mg/kg/day',
    reason:
      'Pediatric azithromycin depends on indication + weight + liquid concentration; overdose increases GI toxicity and cardiac hERG channel QT prolongation.',
    recommended_action: [
      "Verify patient's weight (kg) and target indication",
      'Check suspension label (100 mg/5 mL vs 200 mg/5 mL) before measuring',
      'Screen regimen for hERG QT-prolonging drugs like Domperidone',
    ],
    source: 'WHO Pocket Book of Hospital Care for Children',
    source_url: 'https://www.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 6. Cetirizine
  {
    id: 'rag-cetirizine-ref',
    medicine_name: 'Cetirizine',
    brand_examples: ['Cetzine', 'Okacet', 'Zyrtec'],
    active_ingredient: 'cetirizine',
    patient_group: 'pediatric',
    age_range: '2–18 years (age-banded; avoid <2 yrs without specialist)',
    min_age_months: 24,
    max_age_years: 18,
    weight_guidance:
      'Age-banded: 2–5 yrs: 2.5 mg OD/BD (max 5 mg/day); ≥6 yrs: 5–10 mg/day',
    reference_dose: '2.5 mg/day (2–5 yrs); 5–10 mg/day (≥6 yrs)',
    max_doses_per_day: 2,
    route: 'oral (syrup 5 mg/5 mL or tablet)',
    frequency: 'Once or twice daily age-adjusted',
    maximum: '5 mg/day (ages 2–5); 10 mg/day (≥6 yrs); avoid routine use <2 years',
    contraindications: ['Children under 2 years without pediatrician order', 'Severe renal impairment'],
    interactions: ['CNS depressants / sedative cough syrups'],
    mechanism_target_id: 'PGP',
    safety_status: 'REFERENCE',
    action: 'REFERENCE_CHECK',
    reason:
      'Pediatric cetirizine dosing is strictly age- and formulation-dependent (syrup 5 mg/5 mL vs 10 mg adult tablet).',
    recommended_action: [
      'Verify exact child age band (<2 yrs, 2–5 yrs, or ≥6 yrs)',
      'Verify syrup concentration (5 mg/5 mL) vs 10 mg adult tablet',
      'Confirm no duplicate antihistamines in cough/cold mixtures',
    ],
    source: 'WHO Model Formulary for Children',
    source_url: 'https://iris.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: false,
    requires_formulation_check: true,
  },
  {
    id: 'rag-cetirizine-unsafe',
    medicine_name: 'Cetirizine',
    brand_examples: ['Cetzine 10', 'Okacet'],
    active_ingredient: 'cetirizine',
    patient_group: 'pediatric',
    age_range: 'Under 6 years or <2 years',
    max_age_years: 18,
    weight_guidance: 'Adult 10 mg dose exceeds pediatric ceiling in children <6 years',
    reference_dose: 'Age-dependent (2.5–5 mg/day in 2–5 yrs)',
    max_doses_per_day: 2,
    route: 'oral',
    frequency: 'Age-inappropriate dose or unverified formulation',
    maximum: '5 mg/day under 6 years',
    contraindications: ['Infants <2 years', 'Duplicate antihistamine cough combinations'],
    interactions: ['Chlorpheniramine / Hydroxyzine (additive sedation)'],
    mechanism_target_id: 'PGP',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Adult 10 mg cetirizine dose or infant use without pediatric age/formulation check',
    reason:
      'Pediatric cetirizine is age-dependent; giving adult 10 mg strength or stacking antihistamine syrups causes marked sedation.',
    recommended_action: [
      'Verify patient age and reduce to age-appropriate syrup dose if 2–5 yrs',
      'Do not combine with other antihistamines (e.g., CPM in cold syrups)',
    ],
    source: 'WHO Model Formulary for Children',
    source_url: 'https://iris.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: false,
    requires_formulation_check: true,
  },

  // 7. Diclofenac
  {
    id: 'rag-diclofenac-unsafe',
    medicine_name: 'Diclofenac',
    brand_examples: ['Voveran', 'Reactin'],
    active_ingredient: 'diclofenac',
    patient_group: 'pediatric',
    age_range: 'Under 18 years (Indication & age restricted)',
    max_age_years: 18,
    weight_guidance:
      'Only under specialist pediatric direction (e.g., juvenile arthritis); flag self-medication',
    reference_dose: 'Specialist pediatric indication only (not for routine fever/self-medication)',
    route: 'oral / parenteral',
    frequency: 'Requires specialist supervision',
    maximum: 'Avoid routine pediatric antipyretic or OTC self-medication',
    contraindications: [
      'Routine pediatric fever',
      'Dehydration / dengue / GI ulceration / renal impairment',
    ],
    interactions: ['Ibuprofen', 'Paracetamol + NSAID combos', 'Steroids'],
    mechanism_target_id: 'COX2',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Inappropriate pediatric self-medication or unverified indication',
    reason:
      'Pediatric diclofenac use is strictly age- and indication-dependent; inappropriate self-medication risks acute renal injury, GI bleeding, and Reye-like events.',
    recommended_action: [
      'Flag inappropriate self-medication immediately',
      'Confirm specialist indication and pediatric weight',
      'Verify safer first-line option with pediatrician',
    ],
    source: 'Indian Academy of Pediatrics (IAP) – Standard Treatment Guidelines',
    source_url: 'https://iapindia.org/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 8. Nimesulide
  {
    id: 'rag-nimesulide-unsafe',
    medicine_name: 'Nimesulide',
    brand_examples: ['Nise', 'Nimulid', 'Nicip'],
    active_ingredient: 'nimesulide',
    patient_group: 'pediatric',
    age_range: 'Prohibited under 12 years (CDSCO); major caution <18 years',
    max_age_years: 18,
    weight_guidance: 'Do NOT recommend in children; prohibited under 12 years in India',
    reference_dose: 'CONTRAINDICATED in children <12 years (CDSCO Gazette prohibition)',
    route: 'oral',
    frequency: 'Contraindicated in children',
    maximum: '0 mg in children <12 years',
    contraindications: [
      'Children under 12 years (CDSCO ban)',
      'Hepatic dysfunction',
      'Concurrent hepatotoxic drugs',
    ],
    interactions: ['Paracetamol (additive hepatotoxicity)', 'CYP2C9 / COX-2 inhibitors'],
    mechanism_target_id: 'COX2',
    safety_status: 'CONTRAINDICATED',
    action: 'CONTRAINDICATED_STOP',
    scenario: 'Pediatric Nimesulide exposure (major hepatotoxicity safety concern)',
    reason:
      'Nimesulide carries severe pediatric hepatotoxicity risk and is prohibited for use in children under 12 years by CDSCO.',
    recommended_action: [
      'Do NOT dispense or administer to children under 12 years',
      'Escalate immediately to prescribing doctor for replacement (e.g., weight-checked Paracetamol)',
    ],
    source: 'CDSCO – National Gazette Prohibition (Pediatric Nimesulide <12y)',
    source_url: 'https://cdsco.gov.in/',
    evidence_level: 'Verified',
    requires_weight_check: false,
    requires_formulation_check: true,
  },

  // 9. Cough / Cold Combinations
  {
    id: 'rag-cough-cold-unsafe',
    medicine_name: 'Cough/Cold Combination (Antihistamine + Decongestant / Antitussive)',
    brand_examples: [
      'Sinarest',
      'Wikoryl',
      'Ascoril',
      'Solvin Cold',
      'Chlorpheniramine + Phenylephrine',
    ],
    active_ingredient: 'chlorpheniramine',
    patient_group: 'pediatric',
    age_range: 'Restricted under 4–6 years (CDSCO FDC ban <4y for CPM + Phenylephrine)',
    max_age_years: 12,
    weight_guidance:
      'Multi-ingredient cough/cold FDCs carry overdose, sedation & tachycardia risks in young children',
    reference_dose: 'Avoid combination cough/cold products in young children (<4–6 yrs)',
    route: 'oral syrup / drops / tablet',
    frequency: 'Verify age restrictions for every ingredient',
    maximum: 'Prohibited <4 years for Chlorpheniramine + Phenylephrine FDC (CDSCO)',
    contraindications: [
      'Children under 4 years (CDSCO FDC restriction)',
      'Concurrent single-ingredient Paracetamol/Cetirizine',
    ],
    interactions: [
      'Paracetamol (hidden duplicate in Sinarest/Wikoryl)',
      'CYP2D6 inhibitors (with dextromethorphan/codeine)',
    ],
    mechanism_target_id: 'CYP2D6',
    safety_status: 'RESTRICTED',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Combination cough/cold product prescribed for child',
    reason:
      'Age restrictions vary by ingredient; CDSCO prohibits Chlorpheniramine Maleate + Phenylephrine FDCs below 4 years, and hidden paracetamol risks duplicate overdose.',
    recommended_action: [
      'Check every active ingredient and verify child meets minimum age threshold',
      'Screen for hidden paracetamol or antihistamine duplication',
      'Confirm pediatrician guidance; prefer supportive saline/hydration in young children',
    ],
    source: 'CDSCO – Gazette FDC Restriction & WHO Pocket Book for Children',
    source_url: 'https://cdsco.gov.in/',
    evidence_level: 'Verified',
    requires_weight_check: true,
    requires_formulation_check: true,
  },

  // 10. Metoclopramide
  {
    id: 'rag-metoclopramide-unsafe',
    medicine_name: 'Metoclopramide',
    brand_examples: ['Perinorm', 'Reglan', 'Maxolon'],
    active_ingredient: 'metoclopramide',
    patient_group: 'pediatric',
    age_range: 'Contraindicated <1 year; second-line restricted 1–18 years',
    max_age_years: 18,
    weight_guidance:
      'High risk of acute extrapyramidal dystonia in children; requires clinician verification',
    reference_dose:
      'Contraindicated <1 yr; 0.1–0.15 mg/kg/dose max 5 days ONLY if specialist-verified',
    mg_per_kg_min: 0.1,
    mg_per_kg_max: 0.15,
    max_doses_per_day: 3,
    route: 'oral / parenteral',
    frequency: 'Strictly clinician-verified short duration (≤5 days)',
    maximum: '0.5 mg/kg/day absolute max; contraindicated under 1 year',
    contraindications: [
      'Infants under 1 year',
      'History of extrapyramidal symptoms / seizures',
      'GI obstruction',
    ],
    interactions: [
      'CYP2D6 inhibitors (fluoxetine/paroxetine raise dystonia risk)',
      'Antihistamines / Antipsychotics',
    ],
    mechanism_target_id: 'CYP2D6',
    safety_status: 'POTENTIALLY_UNSAFE',
    action: 'FLAG_FOR_REVIEW',
    scenario: 'Pediatric Metoclopramide prescription requiring clinician verification',
    reason:
      'Metoclopramide is contraindicated under 1 year and carries severe acute dystonic / extrapyramidal reaction risks in children and adolescents.',
    recommended_action: [
      'Require explicit clinician verification and confirm age ≥1 year',
      'Verify exact weight-based micro-dose (≤0.1–0.15 mg/kg) and ≤5 day cap',
      'Monitor closely for neck stiffness, oculogyric crisis, or restlessness',
    ],
    source: 'WHO Model Formulary for Children & CDSCO Safety Restrictions',
    source_url: 'https://iris.who.int/',
    evidence_level: 'Curated',
    requires_weight_check: true,
    requires_formulation_check: true,
  },
];

export function findMedicationRagRecords(
  query: string,
  patientGroup?: MedicationRagEntry['patient_group']
): MedicationRagEntry[] {
  const q = query.trim().toLowerCase();
  return MEDICATION_RAG_DATABASE.filter((entry) => {
    if (patientGroup && entry.patient_group !== patientGroup && entry.patient_group !== 'all') {
      return false;
    }
    if (!q) return true;
    return (
      entry.medicine_name.toLowerCase().includes(q) ||
      entry.active_ingredient.toLowerCase().includes(q) ||
      entry.brand_examples.some((b) => b.toLowerCase().includes(q)) ||
      entry.source.toLowerCase().includes(q) ||
      entry.reason.toLowerCase().includes(q)
    );
  });
}

export function getPediatricReferenceByMedicine(
  medicineOrIngredient: string
): MedicationRagEntry | undefined {
  const target = medicineOrIngredient.trim().toLowerCase();
  return (
    MEDICATION_RAG_DATABASE.find(
      (entry) =>
        entry.patient_group === 'pediatric' &&
        entry.safety_status === 'REFERENCE' &&
        (entry.active_ingredient === target ||
          entry.medicine_name.toLowerCase() === target ||
          entry.brand_examples.some((b) => b.toLowerCase() === target))
    ) ??
    MEDICATION_RAG_DATABASE.find(
      (entry) =>
        entry.patient_group === 'pediatric' &&
        (entry.active_ingredient === target ||
          entry.medicine_name.toLowerCase() === target ||
          entry.brand_examples.some((b) => b.toLowerCase() === target))
    )
  );
}
