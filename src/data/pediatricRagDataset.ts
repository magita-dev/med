export {
  CLINICAL_RAG_SOURCES,
  MEDICATION_RAG_DATABASE as RAG_CLINICAL_RECORDS,
  findMedicationRagRecords,
  getPediatricReferenceByMedicine,
  type MedicationRagEntry,
  type MedicationRagSource as ClinicalRagSource,
} from './medicationDatabase.ts';
