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
  form?: string;
  slots?: number[];
  modifiers?: string[];
  asNeeded?: boolean;
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
  kind?: 'nsq' | 'recall' | 'spurious' | 'prohibition';
  evidenceStatus?: 'verified_alert' | 'historical_fixture' | 'synthetic';
  locator?: string;
  publishedDate?: string;
  reviewedAt?: string;
  sha256?: string;
  verification?: {
    sourceBytes: string;
    transcription: string;
    scope: string;
  };
  reason?: string;
  sourceUrl?: string;
  criteria: {
    productMatch: boolean;
    manufacturerMatch: boolean;
    batchMatch: boolean;
  };
  noticeValues?: {
    productName?: string;
    manufacturer?: string;
    batchNumber?: string;
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

export interface MedicationRagSource {
  id: string;
  name: string;
  scope: string;
  url: string;
  evidenceLevel: 'Verified' | 'Curated';
}

export type MedicationRagEntry = RagClinicalRecord;

export interface PediatricReferenceHint {
  reference_dose: string;
  age_range: string;
  requires_weight_check: boolean;
}

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

export type OverallVerdictStatus =
  | 'SAFE_TO_TAKE'
  | 'CAUTION_REVIEW'
  | 'ACTION_REQUIRED';

export interface ExternalValidationSource {
  id: string;
  title: string;
  category: 'FDA DailyMed Label' | 'RCSB PDB Structure' | 'Mol* AlphaFold DB' | 'Regulatory / Formulary';
  url: string;
  relevance: string;
}

export type SurgicalHistoryStatus =
  | 'none'
  | 'recent_30_days'
  | 'upcoming_within_14_days'
  | 'active_bleeding_or_trauma';

export type DrugAllergyId =
  | 'penicillin_beta_lactam'
  | 'nsaid_aspirin'
  | 'macrolide'
  | 'sulfa'
  | 'statin_myopathy'
  | 'fluoroquinolone'
  | 'paracetamol';

export type FatalRiskFactorId =
  | 'severe_liver_disease'
  | 'severe_kidney_ckd'
  | 'gi_ulcer_or_bleed'
  | 'anticoagulant_therapy'
  | 'cardiac_qt_or_arrhythmia'
  | 'pregnancy_or_breastfeeding'
  | 'asthma_or_nsaid_triad'
  | 'chronic_alcohol_use'
  | 'dehydration_or_sepsis';

export interface PatientHealthQuiz {
  decision: 'pending' | 'taken' | 'skipped';
  completed: boolean;
  completedAt?: string;
  patientAge?: number;
  patientWeightKg?: number;
  surgeryStatus: SurgicalHistoryStatus;
  surgeryDetails?: string;
  allergies: DrugAllergyId[];
  customAllergies: string;
  fatalRiskFactors: FatalRiskFactorId[];
  currentMedicationsNote?: string;
  additionalHistoryNote?: string;
}

export interface QuizRiskFinding {
  id: string;
  category:
    | 'Drug Allergy / Anaphylaxis'
    | 'Recent Surgery / Bleeding Risk'
    | 'Fatal Organ / Systemic Risk'
    | 'Pregnancy / Teratogenic Risk';
  severity: 'Fatal Risk' | 'Critical' | 'Caution';
  title: string;
  drugsInvolved: string[];
  matchedQuizFactor: string;
  clinicalSummary: string;
  recommendedAction: string;
  source: string;
  mechanismTargetId?: MechanismTargetId;
}

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
  quizProfile?: PatientHealthQuiz;
  quizRiskFindings?: QuizRiskFinding[];
  primaryMechanismId: MechanismTargetId;
  validationSources?: ExternalValidationSource[];
  checksRan?: number;
  checksNotRun?: number;
  limitedCoverage?: boolean;
  summaryStats: {
    packAlerts: number;
    dosageIssues: number;
    diseaseMismatches: number;
    regimenFlags: number;
    ragFlags: number;
    quizRiskFlags?: number;
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
  alphafoldViewerUrl: string;
  rcsbStructureUrl: string;
  dailymedUrl?: string;
  dailymedLabel?: string;
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
  kind?: 'nsq' | 'recall' | 'spurious' | 'prohibition';
  evidenceStatus?: 'verified_alert' | 'historical_fixture' | 'synthetic';
  locator?: string;
  sha256?: string;
  reviewedAt?: string;
  verification?: {
    sourceBytes: string;
    transcription: string;
    scope: string;
  };
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

export type LedgerMovementKind =
  | 'stock_in'
  | 'stock_out'
  | 'quarantine'
  | 'return'
  | 'record_correction';

export interface InventoryTransaction {
  id: string;
  stockId: string;
  kind: LedgerMovementKind;
  quantityDelta: number;
  actor: string;
  at: string;
  note: string;
  reported: boolean;
  verified: boolean;
}

export interface InventoryReconciliation {
  stockId: string;
  expectedQuantity: number;
  ledgerQuantity: number;
  matchesRecord: boolean;
  verifiedMovements: number;
  reportedUnverifiedMovements: number;
  allVerified: boolean;
}

export type OutboxMessageStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'retried'
  | 'acknowledged';

export interface OutboxNotification {
  id: string;
  channel: 'in_app' | 'email' | 'sms';
  recipient: string;
  subject: string;
  body: string;
  reviewId?: string | null;
  status: OutboxMessageStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
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
  evidenceSource?: string;
  evidenceLocator?: string;
  proposedBy?: string;
  status: 'Pending Pharmacist Review' | 'Escalated for Clinical Check' | 'Dismissed';
  reviewedBy?: string;
  reviewedAt?: string;
  patientVisible: false;
}

export interface MolecularEvidenceEntry {
  id: string;
  target: MechanismTargetId;
  drug: string;
  relationship: 'metabolism' | 'inhibition' | 'induction' | 'target' | 'transport';
  accession: string;
  structureKind: 'experimental' | 'predicted';
  method: string;
  confidence?: string;
  sourceUrl: string;
  locator: string;
  limitation: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface GovernedRuleAuditRow {
  id: string;
  kind: 'interaction' | 'geriatric' | 'prohibition' | 'dose_ceiling' | 'indication';
  ingredients: string[];
  jurisdiction: string;
  license: string;
  governed: boolean;
  missing: string[];
  expired: boolean;
  reviewedBy: string;
  reviewedAt: string;
  reReviewAt: string;
  source: string;
}

export interface ClinicalRulesGovernanceReport {
  total: number;
  governed: number;
  notGoverned: number;
  expiredCount: number;
  rules: GovernedRuleAuditRow[];
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

export type AppPageId =
  | 'home'
  | 'quiz'
  | 'scan'
  | 'remediation'
  | 'test-cases'
  | 'cell'
  | 'mechanism'
  | 'facility'
  | 'pharmacist';

export type RemediationMatchTrigger =
  | 'DOSAGE_AND_DISEASE_MATCHED'
  | 'DOSAGE_MATCHED_DISEASE_MISMATCH'
  | 'DISEASE_MATCHED_DOSAGE_ISSUE'
  | 'CRITICAL_SAFETY_REMEDIATION'
  | 'GENERAL_CLINICAL_REVIEW';

export type RemediationPriority =
  | 'Immediate'
  | 'Before Next Dose'
  | 'Ongoing Safety'
  | 'Follow-Up';

export interface RemediationTodoStep {
  id: string;
  stepNumber: number;
  priority: RemediationPriority;
  timeframe: string;
  title: string;
  actionDetail: string;
  relatedMedicine: string;
}

export interface SafetyMeasureItem {
  id: string;
  category:
    | 'Clinical Lab / Test'
    | 'Vital & Symptom Watch'
    | 'Administration & Handling'
    | 'Emergency Red Flag';
  title: string;
  whenToUndergo: string;
  rationale: string;
  clinicianQuestion: string;
}

export interface RemediationResourceLink {
  id: string;
  title: string;
  publisher: string;
  scope: string;
  url: string;
  sourceType:
    | 'Clinical Guideline'
    | 'Regulatory / FDA'
    | 'WHO / National Formulary'
    | 'Grounded Web Resource';
}

export interface RemediationPlan {
  planId: string;
  generatedAt: string;
  language: LanguageCode;
  triggerClassification: RemediationMatchTrigger;
  triggerSummary: string;
  dosageMatchStatusSummary: string;
  diseaseMatchStatusSummary: string;
  quizRiskStatusSummary?: string;
  patientCondition: string;
  patientAge: number;
  patientWeightKg?: number;
  overallVerdict: OverallVerdictStatus;
  todoSteps: RemediationTodoStep[];
  safetyMeasures: SafetyMeasureItem[];
  sources: RemediationResourceLink[];
  generatedBy: 'gemini-grounded' | 'clinical-curated-engine';
}

export type GuideUserPersona = 'patient' | 'pediatric' | 'pharmacist' | 'explorer';

export interface GuideChatContext {
  userName?: string;
  isSignedIn: boolean;
  language: LanguageCode;
  activePage: AppPageId;
  persona?: GuideUserPersona;
  savedChecksCount?: number;
  recentSavedSummary?: string;
  quizSummary?: {
    completed: boolean;
    decision: PatientHealthQuiz['decision'];
    summaryText: string;
  };
  latestReport?: {
    overallVerdict: OverallVerdictStatus;
    patientCondition: string;
    patientAge: number;
    primaryMechanismId: MechanismTargetId;
    ragFlags: number;
    dosageIssues: number;
    regimenFlags: number;
    packAlerts: number;
    quizRiskFlags?: number;
  };
}

export interface GuideChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface GuideChatResponse {
  reply: string;
  suggestedPages: AppPageId[];
  suggestedQuestions: string[];
  source: 'gemini-chat' | 'guide-fallback';
}

