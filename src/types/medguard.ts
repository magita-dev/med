export type LanguageCode = 'en' | 'ta' | 'hi';

export type EvidenceTier = 'Verified' | 'Curated' | 'Predicted';

export type PackCheckTier =
  | 'Confirmed'
  | 'Same product, different batch'
  | 'Not found';

export type MechanismTargetId = 'CYP3A4' | 'CYP2D6' | 'HERG' | 'PGP' | 'AMPK' | 'COX2';

export interface PrescriptionItem {
  id: string;
  brandName: string;
  activeIngredients: string[];
  strengthMg: number;
  frequencyPerDay: number;
  totalDailyMg: number;
  durationDays: number;
  route: string;
  batchNumber: string;
  manufacturer: string;
  printedIndication?: string;
  rawLine: string;
  translatedLine?: string;
}

export interface PackCheckResult {
  itemId: string;
  productName: string;
  batchNumber: string;
  manufacturer: string;
  tier: PackCheckTier;
  asOfDate: string;
  alertId?: string;
  agency?: string;
  reason?: string;
  sourceUrl?: string;
  criteria: {
    productMatch: boolean;
    manufacturerMatch: boolean;
    batchMatch: boolean;
  };
  evidenceTier: 'Verified';
}

export interface DosageAuditResult {
  itemId: string;
  brandName: string;
  ingredient: string;
  prescribedDailyMg: number;
  adultMaxDailyMg: number;
  elderlyMaxDailyMg: number;
  typicalRangeLabel: string;
  status:
    | 'Appropriate'
    | 'High / Overdose Risk'
    | 'Elderly Dose Exceeded'
    | 'Pediatric Dose Review Required'
    | 'Pediatric Contraindication'
    | 'Sub-therapeutic / Low'
    | 'Unlisted Ingredient';
  criterionNote: string;
  source: string;
  evidenceTier: 'Curated';
}

export interface DiseaseMatchAudit {
  itemId: string;
  brandName: string;
  ingredient: string;
  patientCondition: string;
  expectedIndications: string[];
  status:
    | 'Matches Condition'
    | 'Symptom Relief Only'
    | 'Indication Mismatch'
    | 'Condition Not Specified';
  criterionNote: string;
  source: string;
  evidenceTier: 'Curated';
}

export interface RegimenFinding {
  id: string;
  category:
    | 'Drug-Drug Interaction'
    | 'Duplicate Ingredient'
    | 'Elderly Risk (Beers)'
    | 'Banned / Restricted FDC'
    | 'Pediatric Contraindication';
  severity: 'Critical' | 'Moderate' | 'Advisory';
  title: string;
  drugsInvolved: string[];
  evidenceTier: 'Verified' | 'Curated';
  source: string;
  criterionMatch: string;
  clinicalSummary: string;
  mechanismTargetId?: MechanismTargetId;
}

export type RagSafetyStatus =
  | 'REFERENCE'
  | 'POTENTIALLY_UNSAFE'
  | 'CONTRAINDICATED'
  | 'RESTRICTED';

export type RagActionCode =
  | 'REFERENCE_CHECK'
  | 'FLAG_FOR_REVIEW'
  | 'CONTRAINDICATED_STOP';

export interface RagClinicalRecord {
  id: string;
  medicine_name: string;
  brand_examples: string[];
  active_ingredient: string;
  patient_group: 'pediatric' | 'adult' | 'elderly' | 'all';
  age_range: string;
  min_age_months?: number;
  max_age_years?: number;
  weight_guidance: string;
  reference_dose: string;
  mg_per_kg_min?: number;
  mg_per_kg_max?: number;
  max_doses_per_day?: number;
  route: string;
  frequency: string;
  maximum: string;
  contraindications: string[];
  interactions: string[];
  mechanism_target_id: MechanismTargetId;
  safety_status: RagSafetyStatus;
  action: RagActionCode;
  scenario?: string;
  reason: string;
  recommended_action: string[];
  source: string;
  source_url: string;
  evidence_level: 'Verified' | 'Curated';
  requires_weight_check: boolean;
  requires_formulation_check: boolean;
}

export interface RagRetrievedMatch {
  itemId: string;
  brandName: string;
  matchedRecord: RagClinicalRecord;
  triggeredUnsafeRecord?: RagClinicalRecord;
  calculatedWeightDoseRange?: string;
  warningBannerTitle: string;
  warningSummary: string;
}

export type OverallVerdictStatus =
  | 'SAFE_TO_TAKE'
  | 'CAUTION_REVIEW'
  | 'ACTION_REQUIRED';

export interface VerificationReport {
  overallVerdict: OverallVerdictStatus;
  verdictHeadline: string;
  verdictQualifier: string;
  asOfDate: string;
  patientCondition: string;
  patientAge: number;
  patientWeightKg?: number;
  packChecks: PackCheckResult[];
  dosageAudits: DosageAuditResult[];
  diseaseAudits: DiseaseMatchAudit[];
  regimenFindings: RegimenFinding[];
  ragMatches: RagRetrievedMatch[];
  primaryMechanismId: MechanismTargetId;
  summaryStats: {
    packAlerts: number;
    dosageIssues: number;
    diseaseMismatches: number;
    regimenFlags: number;
    ragFlags: number;
  };
}

export interface MechanismResidue {
  id: string;
  label: string;
  role: string;
  position: [number, number, number];
}

export interface MechanismTarget {
  id: MechanismTargetId;
  name: string;
  gene: string;
  cellularOrganelle: string;
  membraneType: 'ER_BILAYER' | 'PLASMA_PORE' | 'MITO_CRISTAE' | 'NUCLEAR_ER';
  compartmentSummary: string;
  provenance: 'Experimental (PDB)' | 'AlphaFold-predicted';
  structureId: string;
  resolutionOrConfidence: string;
  plddtScore?: number;
  substrateLabel: string;
  inhibitorLabel: string;
  clashDistanceAngstrom: string;
  residues: MechanismResidue[];
  explanationSummary: string;
  clinicalImplication: string;
  accentHex: string;
}

export interface MultilingualExplanation {
  language: LanguageCode;
  translatedPrescriptionText: string;
  summaryExplanation: string;
  cellularAlphaFoldNote: string;
  doctorQuestions: string[];
  spokenScript: string;
  generatedBy: 'gemini' | 'deterministic-template';
}

export interface RegulatorAlertRecord {
  id: string;
  agency: 'CDSCO' | 'WHO' | 'FDA';
  date: string;
  productName: string;
  activeIngredients: string[];
  manufacturer: string;
  batchNumbers: string[];
  reason: string;
  severity: 'Recall' | 'NSQ Alert' | 'Falsified';
  sourceUrl: string;
}

export interface FacilityStockItem {
  id: string;
  productName: string;
  activeIngredients: string[];
  batchNumber: string;
  manufacturer: string;
  quantityPacks: number;
  shelfLocation: string;
  lastCheckedAt: string;
}

export interface ReverseMatchHit {
  stockItemId: string;
  productName: string;
  batchNumber: string;
  shelfLocation: string;
  quantityPacks: number;
  matchTier: 'Confirmed' | 'Same product, different batch';
  alertId: string;
  agency: string;
  reason: string;
}

export interface PharmacistHypothesis {
  id: string;
  title: string;
  drugsInvolved: string[];
  targetProteinId: MechanismTargetId;
  provenance: 'AlphaFold-predicted' | 'Experimental (PDB)';
  evidenceTier: 'Predicted';
  plddtConfidence: number;
  pocketDistanceAngstrom: number;
  structuralRationale: string;
  status: 'Pending Pharmacist Review' | 'Escalated for Clinical Check' | 'Dismissed';
  reviewedBy?: string;
  reviewedAt?: string;
  patientVisible: false;
}

export interface SamplePreset {
  id: string;
  label: string;
  subtitle: string;
  patientCondition: string;
  patientAge: number;
  rawPrescriptionText: string;
  items: PrescriptionItem[];
}
