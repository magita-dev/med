import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  INITIAL_FACILITY_STOCK,
  INITIAL_INVENTORY_LEDGER,
  INITIAL_MOLECULAR_EVIDENCE,
  INITIAL_OUTBOX_NOTIFICATIONS,
  INITIAL_PHARMACIST_HYPOTHESES,
  MECHANISM_TARGETS,
  REGULATOR_ALERTS,
  buildClinicalRulesGovernanceReport,
} from './src/data/medguardCatalog.ts';
import {
  CLINICAL_RAG_SOURCES,
  RAG_CLINICAL_RECORDS,
} from './src/data/pediatricRagDataset.ts';
import {
  findMedicationRagRecords,
  getPediatricReferenceByMedicine,
} from './src/data/medicationDatabase.ts';
import { flagUnsafeDosagesByConditionAndAge } from './src/utils/dosageHelper.ts';
import {
  buildDeterministicExplanation,
  reverseMatchFacilityStock,
  verifyPrescription,
} from './src/shared/verifier.ts';
import {
  extractDocumentTextLocally,
  extractPatientContextFromText,
  parsePrescriptionLinesWithUnparsed,
  type OcrLineItem,
} from './src/server/documentExtractor.ts';
import {
  buildFallbackGuideReply,
  buildGuideSystemInstruction,
  VALID_GUIDE_PAGES,
} from './src/server/guideChat.ts';
import { generateRemediationPlan } from './src/server/remediationPlanner.ts';
import type {
  AppPageId,
  ConditionAgeDosageEvaluation,
  FacilityStockItem,
  GuideChatContext,
  GuideChatTurn,
  InventoryReconciliation,
  InventoryTransaction,
  LanguageCode,
  LedgerMovementKind,
  MechanismTargetId,
  MolecularEvidenceEntry,
  OutboxNotification,
  PatientHealthQuiz,
  PharmacistHypothesis,
  PrescriptionItem,
  RegulatorAlertRecord,
  VerificationReport,
} from './src/types/medguard.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// In-memory store for Facility Watchlist, Ledger, Outbox & Pharmacist-Only Queue/Evidence
let facilityStock: FacilityStockItem[] = [...INITIAL_FACILITY_STOCK];
let pharmacistQueue: PharmacistHypothesis[] = [...INITIAL_PHARMACIST_HYPOTHESES];
let inventoryLedger: InventoryTransaction[] = [...INITIAL_INVENTORY_LEDGER];
let outboxNotifications: OutboxNotification[] = [...INITIAL_OUTBOX_NOTIFICATIONS];
let molecularEvidence: MolecularEvidenceEntry[] = [...INITIAL_MOLECULAR_EVIDENCE];

const LEDGER_DELTA: Record<LedgerMovementKind, number> = {
  stock_in: 1,
  stock_out: -1,
  quarantine: -1,
  return: 1,
  record_correction: 0,
};

function computeStockReconciliation(stockId: string): InventoryReconciliation | null {
  const item = facilityStock.find((s) => s.id === stockId);
  if (!item) return null;
  const txns = inventoryLedger.filter((t) => t.stockId === stockId);
  const ledgerQuantity = txns.reduce(
    (sum, t) => sum + (LEDGER_DELTA[t.kind] ?? 0) * t.quantityDelta,
    0
  );
  const verifiedMovements = txns.filter((t) => t.verified).length;
  const reportedUnverifiedMovements = txns.filter((t) => t.reported && !t.verified).length;
  return {
    stockId,
    expectedQuantity: item.quantityPacks,
    ledgerQuantity,
    matchesRecord: item.quantityPacks === ledgerQuantity,
    verifiedMovements,
    reportedUnverifiedMovements,
    allVerified: reportedUnverifiedMovements === 0,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'medguard-api' });
  });

  // Live Molecular Structure Metadata & Proxy (RCSB PDB & AlphaFold DB for Mol* Live DB)
  interface CachedAlphaFoldMeta {
    modelEntityId: string;
    latestVersion: number;
    globalPlddt: number | null;
    fractionVeryHigh: number | null;
    fractionConfident: number | null;
    fractionLow: number | null;
    fractionVeryLow: number | null;
    sequenceLength: number | null;
    organism: string | null;
    description: string | null;
    paeImageUrl: string | null;
    bcifUrl: string | null;
    cifUrl: string | null;
  }

  interface CachedPdbMeta {
    title: string | null;
    method: string | null;
    resolutionAngstrom: number | null;
    releaseDate: string | null;
    polymerChains: number | null;
    ligands: string[];
  }

  const structureMetaCache = new Map<
    string,
    { fetchedAt: number; pdb: CachedPdbMeta | null; alphafold: CachedAlphaFoldMeta | null }
  >();
  const structureFileCache = new Map<
    string,
    { fetchedAt: number; buffer: Buffer; contentType: string; isBinary: boolean; format: 'mmcif' }
  >();
  const STRUCTURE_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, application/octet-stream, chemical/x-cif, text/plain, */*',
  };

  async function fetchAlphaFoldMeta(afId: string): Promise<CachedAlphaFoldMeta | null> {
    try {
      const resp = await withTimeout(
        fetch(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(afId)}`, {
          headers: STRUCTURE_HEADERS,
        }),
        9000,
        `AlphaFold API (${afId})`
      );
      if (!resp.ok) return null;
      const arr = (await resp.json()) as Array<Record<string, unknown>>;
      const entry = Array.isArray(arr) ? arr[0] : null;
      if (!entry) return null;
      return {
        modelEntityId: String(entry.modelEntityId || `AF-${afId}-F1`),
        latestVersion: Number(entry.latestVersion || 6),
        globalPlddt:
          typeof entry.globalMetricValue === 'number' ? entry.globalMetricValue : null,
        fractionVeryHigh:
          typeof entry.fractionPlddtVeryHigh === 'number' ? entry.fractionPlddtVeryHigh : null,
        fractionConfident:
          typeof entry.fractionPlddtConfident === 'number' ? entry.fractionPlddtConfident : null,
        fractionLow:
          typeof entry.fractionPlddtLow === 'number' ? entry.fractionPlddtLow : null,
        fractionVeryLow:
          typeof entry.fractionPlddtVeryLow === 'number' ? entry.fractionPlddtVeryLow : null,
        sequenceLength: typeof entry.sequenceEnd === 'number' ? entry.sequenceEnd : null,
        organism:
          typeof entry.organismScientificName === 'string' ? entry.organismScientificName : null,
        description:
          typeof entry.uniprotDescription === 'string' ? entry.uniprotDescription : null,
        paeImageUrl: typeof entry.paeImageUrl === 'string' ? entry.paeImageUrl : null,
        bcifUrl: typeof entry.bcifUrl === 'string' ? entry.bcifUrl : null,
        cifUrl: typeof entry.cifUrl === 'string' ? entry.cifUrl : null,
      };
    } catch {
      return null;
    }
  }

  async function fetchPdbMeta(rcsbId: string): Promise<CachedPdbMeta | null> {
    try {
      const resp = await withTimeout(
        fetch(`https://data.rcsb.org/rest/v1/core/entry/${encodeURIComponent(rcsbId)}`, {
          headers: STRUCTURE_HEADERS,
        }),
        9000,
        `RCSB API (${rcsbId})`
      );
      if (!resp.ok) return null;
      const d = (await resp.json()) as {
        struct?: { title?: string };
        exptl?: Array<{ method?: string }>;
        rcsb_entry_info?: {
          resolution_combined?: number[];
          deposited_polymer_entity_instance_count?: number;
          nonpolymer_bound_components?: string[];
        };
        rcsb_accession_info?: { initial_release_date?: string };
      };
      return {
        title: d.struct?.title ?? null,
        method: d.exptl?.[0]?.method ?? null,
        resolutionAngstrom: d.rcsb_entry_info?.resolution_combined?.[0] ?? null,
        releaseDate: d.rcsb_accession_info?.initial_release_date?.slice(0, 10) ?? null,
        polymerChains: d.rcsb_entry_info?.deposited_polymer_entity_instance_count ?? null,
        ligands: Array.isArray(d.rcsb_entry_info?.nonpolymer_bound_components)
          ? d.rcsb_entry_info.nonpolymer_bound_components
          : [],
      };
    } catch {
      return null;
    }
  }

  app.get('/api/structure/metadata/:targetId', async (req, res) => {
    const targetId = String(req.params.targetId || '').toUpperCase() as MechanismTargetId;
    const target = MECHANISM_TARGETS[targetId];
    if (!target) {
      return res.status(404).json({ error: `Unknown mechanism target "${req.params.targetId}".` });
    }
    const rcsbId = target.structureId.match(/PDB\s+([A-Z0-9]{4})/i)?.[1]?.toUpperCase() ?? '1TQN';
    const afId = target.gene.match(/UniProt\s+([A-Z0-9]+)/i)?.[1]?.toUpperCase() ?? 'P08684';

    const cached = structureMetaCache.get(targetId);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < 1000 * 60 * 30) {
      return res.json({
        targetId,
        rcsbId,
        afId,
        pdb: cached.pdb,
        alphafold: cached.alphafold,
        pdbFileUrl: `/api/structure/file?source=pdb&id=${encodeURIComponent(rcsbId)}`,
        afdbFileUrl: `/api/structure/file?source=afdb&id=${encodeURIComponent(afId)}`,
      });
    }

    const [pdb, alphafold] = await Promise.all([fetchPdbMeta(rcsbId), fetchAlphaFoldMeta(afId)]);
    structureMetaCache.set(targetId, { fetchedAt: now, pdb, alphafold });

    return res.json({
      targetId,
      rcsbId,
      afId,
      pdb,
      alphafold,
      pdbFileUrl: `/api/structure/file?source=pdb&id=${encodeURIComponent(rcsbId)}`,
      afdbFileUrl: `/api/structure/file?source=afdb&id=${encodeURIComponent(afId)}`,
    });
  });

  app.get('/api/structure/file', async (req, res) => {
    const source = req.query.source === 'afdb' ? 'afdb' : req.query.source === 'pdb' ? 'pdb' : null;
    const rawId = String(req.query.id || '').trim().toUpperCase();
    if (!source || !/^[A-Z0-9_-]{3,24}$/.test(rawId)) {
      return res.status(400).json({ error: 'Valid source (pdb|afdb) and structure id are required.' });
    }

    const cacheKey = `${source}:${rawId}`;
    const cached = structureFileCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 60) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('X-Structure-Format', cached.format);
      res.setHeader('X-Structure-Binary', cached.isBinary ? 'true' : 'false');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const candidateUrls: Array<{ url: string; isBinary: boolean; contentType: string }> = [];
    if (source === 'pdb') {
      candidateUrls.push(
        {
          url: `https://models.rcsb.org/${encodeURIComponent(rawId)}.bcif`,
          isBinary: true,
          contentType: 'application/octet-stream',
        },
        {
          url: `https://files.rcsb.org/download/${encodeURIComponent(rawId)}.cif`,
          isBinary: false,
          contentType: 'chemical/x-cif; charset=utf-8',
        }
      );
    } else {
      const afMeta = await fetchAlphaFoldMeta(rawId);
      if (afMeta?.bcifUrl) {
        candidateUrls.push({
          url: afMeta.bcifUrl,
          isBinary: true,
          contentType: 'application/octet-stream',
        });
      }
      if (afMeta?.cifUrl) {
        candidateUrls.push({
          url: afMeta.cifUrl,
          isBinary: false,
          contentType: 'chemical/x-cif; charset=utf-8',
        });
      }
      const ver = afMeta?.latestVersion ?? 6;
      candidateUrls.push({
        url: `https://alphafold.ebi.ac.uk/files/AF-${encodeURIComponent(rawId)}-F1-model_v${ver}.cif`,
        isBinary: false,
        contentType: 'chemical/x-cif; charset=utf-8',
      });
    }

    for (const candidate of candidateUrls) {
      try {
        const upstream = await withTimeout(
          fetch(candidate.url, { headers: STRUCTURE_HEADERS }),
          15000,
          `Structure fetch (${candidate.url})`
        );
        if (!upstream.ok) continue;
        const arrBuf = await upstream.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        if (buf.length < 128) continue;

        if (structureFileCache.size > 24) {
          const oldestKey = structureFileCache.keys().next().value;
          if (oldestKey) structureFileCache.delete(oldestKey);
        }
        structureFileCache.set(cacheKey, {
          fetchedAt: Date.now(),
          buffer: buf,
          contentType: candidate.contentType,
          isBinary: candidate.isBinary,
          format: 'mmcif',
        });

        res.setHeader('Content-Type', candidate.contentType);
        res.setHeader('X-Structure-Format', 'mmcif');
        res.setHeader('X-Structure-Binary', candidate.isBinary ? 'true' : 'false');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(buf);
      } catch {
        // Try next candidate
      }
    }

    return res.status(502).json({
      error: `Unable to fetch live 3D structure data for ${source.toUpperCase()} ${rawId}.`,
    });
  });

  // 1. Document, Image OCR & Structured Prescription Translation (AI reads & translates ONLY; never invents clinical alerts)
  app.post('/api/prescription/ocr-parse', async (req, res) => {
    const body = req.body as {
      imageBase64?: string;
      fileBase64?: string;
      mimeType?: string;
      fileName?: string;
      rawText?: string;
      language?: LanguageCode;
    };

    const fileData = body.fileBase64 || body.imageBase64;
    const mimeType = body.mimeType || 'application/octet-stream';
    const fileName = body.fileName || '';
    const language: LanguageCode = body.language || 'en';
    const rawText = body.rawText;

    let localExtractedText = '';
    let localKind: 'text' | 'docx' | 'pdf' | 'image' | null = null;
    let isScannedPdf = false;
    let ocrLines: OcrLineItem[] = [];

    try {
      const hasFile = Boolean(fileData);
      const isImageMime =
        mimeType.toLowerCase().startsWith('image/') &&
        !/\.(pdf|docx|txt|csv|md|json|rtf|html?|xml)$/i.test(fileName);

      // Extract text locally up-front for text, DOCX, and digital PDF documents
      if (hasFile && fileData && !isImageMime) {
        const localRes = await extractDocumentTextLocally({
          base64Data: fileData,
          mimeType,
          fileName,
        });
        localExtractedText = localRes.text;
        localKind = localRes.kind;
        isScannedPdf = Boolean(localRes.isEmptyScannedPdf);
        ocrLines = localRes.ocrLines ?? [];
      }

      const ai = getAiClient();
      const textToParse = localExtractedText || rawText || '';

      // Deterministic path when GEMINI_API_KEY is not configured
      if (!ai) {
        if (hasFile && fileData && isImageMime) {
          const ocrRes = await extractDocumentTextLocally({
            base64Data: fileData,
            mimeType,
            fileName,
          });
          const extracted = ocrRes.text;
          ocrLines = ocrRes.ocrLines ?? [];
          const parsedDet = extracted
            ? parsePrescriptionLinesWithUnparsed(extracted, language)
            : { items: [], unparsedLines: [] };
          const ctx = extractPatientContextFromText(extracted);
          return res.json({
            items: parsedDet.items,
            unparsedLines: parsedDet.unparsedLines,
            ocrLines,
            extractedRawText: extracted,
            detectedCondition: ctx.detectedCondition,
            detectedAge: ctx.detectedAge,
            detectedWeightKg: ctx.detectedWeightKg,
            source: 'tesseract-ocr',
          });
        }

        if (isScannedPdf && !textToParse.trim()) {
          return res.status(422).json({
            error:
              'This PDF appears to be a scanned image with no selectable text layer. Please upload a PNG/JPG photo of the page or configure GEMINI_API_KEY for scanned PDF OCR.',
          });
        }

        if (textToParse.trim()) {
          const parsedDet = parsePrescriptionLinesWithUnparsed(textToParse, language);
          const ctx = extractPatientContextFromText(textToParse);
          return res.json({
            items: parsedDet.items,
            unparsedLines: parsedDet.unparsedLines,
            ocrLines,
            extractedRawText: textToParse,
            detectedCondition: ctx.detectedCondition,
            detectedAge: ctx.detectedAge,
            detectedWeightKg: ctx.detectedWeightKg,
            source: localKind ? `document-${localKind}-parser` : 'deterministic-parser',
          });
        }

        return res.status(400).json({
          error: 'No readable text or image content was found in the uploaded file.',
        });
      }

      // Gemini-powered extraction (supports Images, Scanned/Digital PDFs, and extracted DOCX/TXT text)
      const targetLangName =
        language === 'ta' ? 'Tamil' : language === 'hi' ? 'Hindi' : 'English';

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      const shouldSendBinaryToGemini =
        hasFile &&
        fileData &&
        (isImageMime ||
          ((mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) &&
            !localExtractedText));

      if (shouldSendBinaryToGemini && fileData) {
        parts.push({
          inlineData: {
            mimeType: isImageMime ? mimeType : 'application/pdf',
            data: fileData,
          },
        });
      }

      parts.push({
        text: `You are a strictly bounded prescription & medicine-pack document extractor.
Extract ALL legible text into extractedRawText AND extract ONLY the medicines, strengths (in mg), dosing frequencies per day, durations, batch numbers, manufacturers, and any printed diagnosis/patient age/weight explicitly visible in ${
          shouldSendBinaryToGemini
            ? 'this uploaded prescription document or image'
            : `this extracted document text:\n${textToParse}`
        }.
IMPORTANT:
- Map brand names to their lowercase generic INN active ingredients (e.g. Dolo-650/Calpol/Crocin -> ["paracetamol"], Brufen -> ["ibuprofen"], Mox/Augmentin -> ["amoxicillin"], Azithral -> ["azithromycin"], Pan-40 -> ["pantoprazole"], Glycomet -> ["metformin"], Atorva -> ["atorvastatin"], Telma -> ["telmisartan"], Sinarest -> ["chlorpheniramine", "phenylephrine", "paracetamol"]).
- Convert shorthand like OD=1/day, BD=2/day, TDS/TID=3/day, QID=4/day, 1-0-1=2/day, 1-1-1=3/day, 2-2-2-2=8/day.
- Provide a plain-language translatedLine in ${targetLangName} for each medicine.
- Do NOT invent warnings or safety verdicts. Always return extractedRawText with the full text read from the document even if items is empty.`,
      });

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction:
              'Extract printed or handwritten prescription medicines and document text faithfully into JSON. Never add clinical warnings.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                extractedRawText: { type: Type.STRING },
                detectedCondition: { type: Type.STRING },
                detectedAge: { type: Type.NUMBER },
                detectedWeightKg: { type: Type.NUMBER },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      brandName: { type: Type.STRING },
                      activeIngredients: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      strengthMg: { type: Type.NUMBER },
                      frequencyPerDay: { type: Type.NUMBER },
                      durationDays: { type: Type.NUMBER },
                      route: { type: Type.STRING },
                      batchNumber: { type: Type.STRING },
                      manufacturer: { type: Type.STRING },
                      rawLine: { type: Type.STRING },
                      translatedLine: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        }),
        localExtractedText || rawText ? 8000 : 22000,
        'Gemini document extraction'
      );

      const rawJson = (response.text ?? '{}')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(rawJson || '{}') as {
        extractedRawText?: string;
        detectedCondition?: string;
        detectedAge?: number;
        detectedWeightKg?: number;
        items?: Array<Partial<PrescriptionItem>>;
      };

      const finalExtractedText = parsed.extractedRawText || textToParse || '';
      const ctxFallback = extractPatientContextFromText(finalExtractedText);

      let items: PrescriptionItem[] = (parsed.items ?? []).map((item, idx) => {
        const strengthMg = Number(item.strengthMg) || 0;
        const frequencyPerDay = Number(item.frequencyPerDay) || 1;
        return {
          id: `rx-${Date.now()}-${idx + 1}`,
          brandName: item.brandName || `Medicine ${idx + 1}`,
          activeIngredients:
            item.activeIngredients && item.activeIngredients.length
              ? item.activeIngredients.map((s) => s.toLowerCase().trim())
              : [(item.brandName || 'unknown').toLowerCase()],
          strengthMg,
          frequencyPerDay,
          totalDailyMg: Math.round(strengthMg * frequencyPerDay * 100) / 100,
          durationDays: Number(item.durationDays) || 5,
          route: item.route || 'Oral after food',
          batchNumber: item.batchNumber || '',
          manufacturer: item.manufacturer || '',
          rawLine: item.rawLine || item.brandName || '',
          translatedLine: item.translatedLine || item.rawLine || '',
        };
      });

      const detFallback = finalExtractedText.trim()
        ? parsePrescriptionLinesWithUnparsed(finalExtractedText, language)
        : { items: [], unparsedLines: [] };

      let unparsedLines: string[] = detFallback.unparsedLines;
      if (items.length === 0 && detFallback.items.length > 0) {
        items = detFallback.items;
      }

      if (ocrLines.length === 0 && finalExtractedText.trim() && isImageMime) {
        ocrLines = finalExtractedText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => ({ text: l, confidence: 0.92 }));
      }

      return res.json({
        items,
        unparsedLines,
        ocrLines,
        extractedRawText: finalExtractedText,
        detectedCondition: parsed.detectedCondition || ctxFallback.detectedCondition || '',
        detectedAge: parsed.detectedAge || ctxFallback.detectedAge || undefined,
        detectedWeightKg: parsed.detectedWeightKg || ctxFallback.detectedWeightKg || undefined,
        source: 'gemini-ocr',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Document extraction failed';
      try {
        let fallbackText = localExtractedText || rawText || '';
        if (!fallbackText && fileData && !isScannedPdf) {
          const fallbackRes = await extractDocumentTextLocally({
            base64Data: fileData,
            mimeType,
            fileName,
          });
          fallbackText = fallbackRes.text;
          ocrLines = fallbackRes.ocrLines ?? ocrLines;
        }
        if (fallbackText.trim()) {
          const fallbackDet = parsePrescriptionLinesWithUnparsed(fallbackText, language);
          const ctx = extractPatientContextFromText(fallbackText);
          return res.json({
            items: fallbackDet.items,
            unparsedLines: fallbackDet.unparsedLines,
            ocrLines,
            extractedRawText: fallbackText,
            detectedCondition: ctx.detectedCondition,
            detectedAge: ctx.detectedAge,
            detectedWeightKg: ctx.detectedWeightKg,
            source: 'local-fallback-extractor',
            warning: msg,
          });
        }
        if (isScannedPdf) {
          return res.status(422).json({
            error:
              'This PDF appears to be a scanned image without a selectable text layer and cloud OCR timed out. Please upload a PNG/JPG photo of the page.',
          });
        }
      } catch {
        // Return original extraction error below
      }
      return res.status(500).json({ error: msg });
    }
  });

  // 2. Deterministic Verification Engine (Regulator Pack Check + Dosage + Disease Match + Pediatric RAG + Regimen + Patient Health Quiz)
  app.post('/api/prescription/verify', (req, res) => {
    const {
      items = [],
      patientCondition = '',
      patientAge = 45,
      patientWeightKg,
      quizProfile,
    } = req.body as {
      items?: PrescriptionItem[];
      patientCondition?: string;
      patientAge?: number;
      patientWeightKg?: number;
      quizProfile?: PatientHealthQuiz;
    };

    const weightVal =
      typeof patientWeightKg === 'number' && patientWeightKg > 0
        ? patientWeightKg
        : Number(patientWeightKg) > 0
          ? Number(patientWeightKg)
          : undefined;
    const parsedAge = Number(patientAge);
    const safeAge = Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge : 45;
    const report = verifyPrescription(items, patientCondition, safeAge, weightVal, quizProfile);
    res.json(report);
  });

  // 2b. Searchable Pediatric Clinical RAG Knowledge Base (Backend-Only CDSCO / IAP / WHO)
  app.get('/api/rag/records', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim().toUpperCase();
    const matchedByQuery = q
      ? new Set(findMedicationRagRecords(q, 'pediatric').map((r) => r.id))
      : null;
    const ql = q.toLowerCase();

    const records = RAG_CLINICAL_RECORDS.filter((r) => {
      const matchesStatus = !status || status === 'ALL' || r.safety_status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        matchedByQuery?.has(r.id) ||
        r.medicine_name.toLowerCase().includes(ql) ||
        r.active_ingredient.toLowerCase().includes(ql) ||
        r.brand_examples.some((b) => b.toLowerCase().includes(ql)) ||
        r.source.toLowerCase().includes(ql) ||
        r.reason.toLowerCase().includes(ql)
      );
    });

    const counts = {
      total: RAG_CLINICAL_RECORDS.length,
      reference: RAG_CLINICAL_RECORDS.filter((r) => r.safety_status === 'REFERENCE').length,
      unsafe: RAG_CLINICAL_RECORDS.filter((r) => r.safety_status === 'POTENTIALLY_UNSAFE').length,
      contraOrRestricted: RAG_CLINICAL_RECORDS.filter(
        (r) => r.safety_status === 'CONTRAINDICATED' || r.safety_status === 'RESTRICTED'
      ).length,
    };

    res.json({
      sources: CLINICAL_RAG_SOURCES,
      records,
      totalCount: RAG_CLINICAL_RECORDS.length,
      counts,
    });
  });

  // 2c. Backend Condition & Age RAG Dosage Evaluation (keeps RAG DB exclusively on backend)
  app.post('/api/rag/evaluate-dosage', (req, res) => {
    const {
      items = [],
      patientCondition = '',
      patientAge = 45,
      patientWeightKg,
      quizProfile,
    } = req.body as {
      items?: PrescriptionItem[];
      patientCondition?: string;
      patientAge?: number;
      patientWeightKg?: number;
      quizProfile?: PatientHealthQuiz;
    };

    const parsedAge = Number(patientAge);
    const safeAge = Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge : 45;
    const weightVal =
      Number(patientWeightKg) > 0 ? Number(patientWeightKg) : undefined;

    const evaluation = flagUnsafeDosagesByConditionAndAge({
      items,
      patientCondition,
      patientAge: safeAge,
      patientWeightKg: weightVal,
      quizProfile,
    });

    const pediatricRefsByItemId: Record<
      string,
      { reference_dose: string; age_range: string; requires_weight_check: boolean }
    > = {};

    if (safeAge < 18) {
      for (const item of items) {
        const pedRef = getPediatricReferenceByMedicine(
          item.activeIngredients?.[0] || item.brandName
        );
        if (pedRef) {
          pediatricRefsByItemId[item.id] = {
            reference_dose: pedRef.reference_dose,
            age_range: pedRef.age_range,
            requires_weight_check: pedRef.requires_weight_check,
          };
        }
      }
    }

    res.json({
      evaluation,
      pediatricRefsByItemId,
    });
  });

  // 3. Strictly Grounded Multilingual Explanation + AlphaFold Cellular Note + Doctor Questions
  app.post('/api/prescription/explain', async (req, res) => {
    const {
      items = [],
      report,
      language = 'en',
    } = req.body as {
      items?: PrescriptionItem[];
      report: VerificationReport;
      language?: LanguageCode;
    };

    if (!report) {
      return res.status(400).json({ error: 'VerificationReport is required.' });
    }

    const ai = getAiClient();
    const mech = MECHANISM_TARGETS[report.primaryMechanismId];

    if (!ai) {
      return res.json(buildDeterministicExplanation(items, report, language));
    }

    try {
      const targetLang =
        language === 'ta'
          ? 'Tamil (தமிழ் script, clear everyday spoken style)'
          : language === 'hi'
            ? 'Hindi (हिन्दी Devanagari script, clear everyday style)'
            : 'English (clear plain language)';

      const prompt = `Translate and explain ONLY the verified MedGuard report below in ${targetLang}.
STRICT SAFETY RULE: You MUST NOT invent any new drug warnings, side effects, or regulatory recalls beyond what is explicitly inside the JSON report and retrieved RAG references.
Include:
1. translatedPrescriptionText: bullet/numbered clear instructions for each medicine in ${targetLang}.
2. summaryExplanation: plain-language summary of whether the prescription passed all checked rules (Safe) or needs review/unsafe action, explicitly highlighting ANY Patient Health Quiz findings in report.quizRiskFindings (drug allergies, recent/upcoming surgery hemorrhage risks, liver/kidney/heart QT/pregnancy fatal risks) as well as naming the authoritative sources from report.validationSources and any retrieved pediatric RAG references from ragMatches.
3. cellularAlphaFoldNote: explain in 2-3 clear sentences how the primary target protein (${mech.name}, ${mech.structureId}, ${mech.provenance}) inside the cell's "${mech.cellularOrganelle}" relates to these medicines, citing ${mech.rcsbStructureUrl} and ${mech.alphafoldViewerUrl}.
4. doctorQuestions: 3 concise, practical questions the patient can ask their doctor or pharmacist in ${targetLang} (prioritizing any flagged quiz allergy/surgery/organ risk first).
5. spokenScript: a warm 3-4 sentence voice-ready summary combining summaryExplanation and cellularAlphaFoldNote in ${targetLang}.

PRESCRIPTION ITEMS:
${JSON.stringify(items)}

VERIFIED REPORT + PATIENT HEALTH QUIZ + RETRIEVED RAG REFERENCES JSON:
${JSON.stringify(report)}`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              'You are MedGuard Explainer. You ONLY translate and explain pre-verified deterministic findings. Never fabricate warnings or override the overallVerdict.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                translatedPrescriptionText: { type: Type.STRING },
                summaryExplanation: { type: Type.STRING },
                cellularAlphaFoldNote: { type: Type.STRING },
                doctorQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                spokenScript: { type: Type.STRING },
              },
            },
          },
        }),
        18000,
        'Gemini explanation'
      );

      const data = JSON.parse((response.text ?? '{}').trim()) as {
        translatedPrescriptionText?: string;
        summaryExplanation?: string;
        cellularAlphaFoldNote?: string;
        doctorQuestions?: string[];
        spokenScript?: string;
      };

      const fallback = buildDeterministicExplanation(items, report, language);
      return res.json({
        language,
        translatedPrescriptionText:
          data.translatedPrescriptionText || fallback.translatedPrescriptionText,
        summaryExplanation: data.summaryExplanation || fallback.summaryExplanation,
        cellularAlphaFoldNote: data.cellularAlphaFoldNote || fallback.cellularAlphaFoldNote,
        doctorQuestions:
          data.doctorQuestions && data.doctorQuestions.length
            ? data.doctorQuestions
            : fallback.doctorQuestions,
        spokenScript: data.spokenScript || fallback.spokenScript,
        generatedBy: 'gemini',
      });
    } catch {
      return res.json(buildDeterministicExplanation(items, report, language));
    }
  });

  // 3b. Grounded Next Remediation Plan & Safety Measures (displayed on dedicated To-Do Next page)
  app.post('/api/prescription/remediation-plan', async (req, res) => {
    const {
      items = [],
      report,
      ragEvaluation = null,
      language = 'en',
    } = req.body as {
      items?: PrescriptionItem[];
      report?: VerificationReport;
      ragEvaluation?: ConditionAgeDosageEvaluation | null;
      language?: LanguageCode;
    };

    if (!report) {
      return res.status(400).json({ error: 'VerificationReport is required to generate a remediation plan.' });
    }

    const ai = getAiClient();
    const plan = await generateRemediationPlan(
      ai,
      items,
      report,
      language,
      ragEvaluation
    );
    return res.json(plan);
  });

  // 4. Multilingual TTS Voice Synthesis via Gemini 3.8 Flash Lite TTS
  app.post('/api/tts', async (req, res) => {
    const { text, language = 'en' } = req.body as {
      text?: string;
      language?: LanguageCode;
    };

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required for speech synthesis.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({ error: 'TTS service unavailable; use browser speech synthesis.' });
    }

    try {
      const style =
        language === 'ta'
          ? 'Calm, clear, compassionate medical explainer speaking natural Tamil'
          : language === 'hi'
            ? 'Calm, clear, compassionate medical explainer speaking natural Hindi'
            : 'Calm, clear, reassuring clinical explainer';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.slice(0, 1200),
                speechMetadata: { style },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(503).json({ error: 'Audio stream empty' });
      }
      return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS failed';
      return res.status(503).json({ error: msg });
    }
  });

  // 5. Facility Watchlist & Reverse Matching
  app.get('/api/facility/watchlist', (_req, res) => {
    res.json({
      stock: facilityStock,
      alerts: REGULATOR_ALERTS,
    });
  });

  app.post('/api/facility/stock', (req, res) => {
    const item = req.body as Omit<FacilityStockItem, 'id' | 'lastCheckedAt'>;
    const created: FacilityStockItem = {
      ...item,
      id: `stk-${Date.now()}`,
      lastCheckedAt: new Date().toISOString().slice(0, 10),
    };
    facilityStock = [created, ...facilityStock];
    res.json({ stock: facilityStock });
  });

  app.post('/api/facility/reverse-match', (req, res) => {
    const { alertId, customAlert } = req.body as {
      alertId?: string;
      customAlert?: RegulatorAlertRecord;
    };
    const alert =
      customAlert ?? REGULATOR_ALERTS.find((a) => a.id === alertId) ?? REGULATOR_ALERTS[0];
    const hits = reverseMatchFacilityStock(facilityStock, alert);
    const now = new Date().toISOString().slice(0, 10);
    facilityStock = facilityStock.map((s) => ({ ...s, lastCheckedAt: now }));
    res.json({
      alert,
      hits,
      checkedCount: facilityStock.length,
      checkedAt: now,
    });
  });

  // 5b. Clinical Rule Governance Audit (license, evidence, reviewer, expiry transparency)
  app.get('/api/clinical/rules', (_req, res) => {
    res.json(buildClinicalRulesGovernanceReport());
  });

  // 5c. Closed-Loop Inventory Transaction Ledger & Reconciliation
  app.get('/api/facility/stock/:id/transactions', (req, res) => {
    const { id } = req.params;
    const reconciliation = computeStockReconciliation(id);
    if (!reconciliation) {
      return res.status(404).json({ error: `Stock item "${id}" not found.` });
    }
    const transactions = inventoryLedger.filter((t) => t.stockId === id);
    return res.json({ transactions, reconciliation });
  });

  app.get('/api/facility/stock/:id/reconcile', (req, res) => {
    const { id } = req.params;
    const reconciliation = computeStockReconciliation(id);
    if (!reconciliation) {
      return res.status(404).json({ error: `Stock item "${id}" not found.` });
    }
    return res.json({ reconciliation });
  });

  app.post('/api/facility/stock/:id/movements', (req, res) => {
    const { id } = req.params;
    const stockItem = facilityStock.find((s) => s.id === id);
    if (!stockItem) {
      return res.status(404).json({ error: `Stock item "${id}" not found.` });
    }
    const body = req.body as {
      kind?: LedgerMovementKind;
      quantityDelta?: number;
      actor?: string;
      note?: string;
      verified?: boolean;
    };
    const validKinds: LedgerMovementKind[] = [
      'stock_in',
      'stock_out',
      'quarantine',
      'return',
      'record_correction',
    ];
    const kind: LedgerMovementKind =
      body.kind && validKinds.includes(body.kind) ? body.kind : 'quarantine';
    const qty = Number(body.quantityDelta);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantityDelta must be a positive number.' });
    }
    const verified = Boolean(body.verified);
    const txn: InventoryTransaction = {
      id: `txn-${Date.now()}`,
      stockId: id,
      kind,
      quantityDelta: Math.round(qty),
      actor: (body.actor || 'Facility Pharmacist').trim(),
      at: new Date().toISOString(),
      note: (body.note || `${kind} recorded`).trim(),
      reported: true,
      verified,
    };
    inventoryLedger = [txn, ...inventoryLedger];

    if (verified && kind !== 'record_correction') {
      const signed = (LEDGER_DELTA[kind] ?? 0) * txn.quantityDelta;
      facilityStock = facilityStock.map((s) =>
        s.id === id
          ? {
              ...s,
              quantityPacks: Math.max(0, s.quantityPacks + signed),
              lastCheckedAt: new Date().toISOString().slice(0, 10),
            }
          : s
      );
    }

    const transactions = inventoryLedger.filter((t) => t.stockId === id);
    const reconciliation = computeStockReconciliation(id);
    return res.json({ transaction: txn, transactions, reconciliation, stock: facilityStock });
  });

  // 5d. Durable Recall Notification Outbox
  app.get('/api/facility/outbox', (_req, res) => {
    res.json({ notifications: outboxNotifications });
  });

  app.post('/api/facility/outbox', (req, res) => {
    const body = req.body as {
      channel?: 'in_app' | 'email' | 'sms';
      recipient?: string;
      subject?: string;
      body?: string;
      reviewId?: string;
    };
    if (!body.recipient?.trim() || !body.subject?.trim()) {
      return res.status(400).json({ error: 'Recipient and subject are required.' });
    }
    const created: OutboxNotification = {
      id: `out-${Date.now()}`,
      channel: body.channel || 'in_app',
      recipient: body.recipient.trim(),
      subject: body.subject.trim(),
      body: (body.body || body.subject).trim(),
      reviewId: body.reviewId || null,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    };
    outboxNotifications = [created, ...outboxNotifications];
    return res.json({ notification: created, notifications: outboxNotifications });
  });

  app.post('/api/facility/outbox/deliver', (_req, res) => {
    const now = new Date().toISOString();
    let delivered = 0;
    outboxNotifications = outboxNotifications.map((msg) => {
      if (msg.status === 'pending' || msg.status === 'retried' || msg.status === 'failed') {
        delivered += 1;
        return {
          ...msg,
          status: 'delivered',
          attempts: msg.attempts + 1,
          lastAttemptAt: now,
          deliveredAt: now,
          lastError: null,
        };
      }
      return msg;
    });
    res.json({ delivered, notifications: outboxNotifications });
  });

  app.put('/api/facility/outbox/:id/ack', (req, res) => {
    const { id } = req.params;
    const found = outboxNotifications.some((m) => m.id === id);
    if (!found) {
      return res.status(404).json({ error: `Outbox notification "${id}" not found.` });
    }
    outboxNotifications = outboxNotifications.map((m) =>
      m.id === id ? { ...m, status: 'acknowledged' } : m
    );
    return res.json({ notifications: outboxNotifications });
  });

  // 6. Pharmacist-Only Structure Hypothesis Queue & Molecular Evidence Catalog (patientVisible: false)
  app.get('/api/pharmacist/hypotheses', (_req, res) => {
    res.json({ hypotheses: pharmacistQueue });
  });

  app.post('/api/pharmacist/hypotheses', (req, res) => {
    const body = req.body as {
      title?: string;
      drugsInvolved?: string[];
      targetProteinId?: MechanismTargetId;
      provenance?: 'AlphaFold-predicted' | 'Experimental (PDB)';
      plddtConfidence?: number;
      pocketDistanceAngstrom?: number;
      structuralRationale?: string;
      evidenceSource?: string;
      evidenceLocator?: string;
      proposedBy?: string;
    };
    if (!body.title?.trim() || !body.structuralRationale?.trim()) {
      return res.status(400).json({ error: 'Hypothesis title and structural rationale are required.' });
    }
    const created: PharmacistHypothesis = {
      id: `hyp-${Date.now()}`,
      title: body.title.trim(),
      drugsInvolved:
        body.drugsInvolved && body.drugsInvolved.length > 0
          ? body.drugsInvolved.map((d) => d.trim().toLowerCase()).filter(Boolean)
          : ['unspecified'],
      targetProteinId: body.targetProteinId || 'CYP3A4',
      provenance: body.provenance || 'AlphaFold-predicted',
      evidenceTier: 'Predicted',
      plddtConfidence: Number(body.plddtConfidence) || 88.5,
      pocketDistanceAngstrom: Number(body.pocketDistanceAngstrom) || 3.1,
      structuralRationale: body.structuralRationale.trim(),
      evidenceSource: body.evidenceSource?.trim() || undefined,
      evidenceLocator: body.evidenceLocator?.trim() || undefined,
      proposedBy: body.proposedBy?.trim() || 'Clinical Pharmacist',
      status: 'Pending Pharmacist Review',
      patientVisible: false,
    };
    pharmacistQueue = [created, ...pharmacistQueue];
    return res.json({ hypothesis: created, hypotheses: pharmacistQueue });
  });

  app.post('/api/pharmacist/hypotheses/:id/review', (req, res) => {
    const { id } = req.params;
    const { action, reviewer = 'Dr. R. Subramanian (RPh)' } = req.body as {
      action: 'escalate' | 'dismiss';
      reviewer?: string;
    };
    const now = new Date().toISOString().slice(0, 10);
    pharmacistQueue = pharmacistQueue.map((h) =>
      h.id === id
        ? {
            ...h,
            status: action === 'escalate' ? 'Escalated for Clinical Check' : 'Dismissed',
            reviewedBy: reviewer,
            reviewedAt: now,
          }
        : h
    );
    res.json({ hypotheses: pharmacistQueue });
  });

  app.get('/api/pharmacist/evidence', (_req, res) => {
    res.json({ evidence: molecularEvidence });
  });

  app.post('/api/pharmacist/evidence', (req, res) => {
    const body = req.body as Partial<MolecularEvidenceEntry>;
    if (!body.drug?.trim() || !body.accession?.trim() || !body.locator?.trim()) {
      return res.status(400).json({ error: 'Drug, accession, and locator are required.' });
    }
    const created: MolecularEvidenceEntry = {
      id: `ev-${Date.now()}`,
      target: (body.target as MechanismTargetId) || 'CYP3A4',
      drug: body.drug.trim().toLowerCase(),
      relationship: body.relationship || 'metabolism',
      accession: body.accession.trim().toUpperCase(),
      structureKind: body.structureKind === 'predicted' ? 'predicted' : 'experimental',
      method: body.method?.trim() || (body.structureKind === 'predicted' ? 'AlphaFold DB' : 'X-ray diffraction'),
      confidence: body.confidence?.trim() || undefined,
      sourceUrl:
        body.sourceUrl?.trim() ||
        (body.structureKind === 'predicted'
          ? `https://alphafold.ebi.ac.uk/entry/${body.accession.trim().toUpperCase()}`
          : `https://www.rcsb.org/structure/${body.accession.trim().toUpperCase()}`),
      locator: body.locator.trim(),
      limitation:
        body.limitation?.trim() ||
        'Mechanism evidence explains drug-protein geometry; clinical prescribing decisions require approved labeling.',
      reviewedBy: body.reviewedBy?.trim() || 'Dr. R. Subramanian (RPh)',
      reviewedAt: new Date().toISOString().slice(0, 10),
    };
    molecularEvidence = [created, ...molecularEvidence];
    return res.json({ entry: created, evidence: molecularEvidence });
  });

  // 7. Personalized Multi-Turn MedGuard Guide Chatbot (Gemini 4 Hydrogen)
  app.post('/api/chat/guide', async (req, res) => {
    const body = req.body as {
      message?: string;
      history?: GuideChatTurn[];
      context?: GuideChatContext;
    };

    const userMessage = (body.message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const context: GuideChatContext = body.context ?? {
      isSignedIn: false,
      language: 'en',
      activePage: 'home',
      persona: 'patient',
    };

    const ai = getAiClient();
    if (!ai) {
      return res.json(buildFallbackGuideReply(userMessage, context));
    }

    try {
      const sanitizedTurns = (body.history ?? [])
        .filter((t) => (t.role === 'user' || t.role === 'model') && t.text?.trim())
        .slice(-16);

      // Gemini chat history should begin with a user turn when non-empty
      const firstUserIdx = sanitizedTurns.findIndex((t) => t.role === 'user');
      const alignedHistory =
        firstUserIdx >= 0
          ? sanitizedTurns.slice(firstUserIdx).map((t) => ({
              role: t.role,
              parts: [{ text: t.text }],
            }))
          : [];

      const systemInstruction = buildGuideSystemInstruction(context);
      const chatSchema = {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          suggestedPages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          suggestedQuestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['reply', 'suggestedPages', 'suggestedQuestions'],
      };

      const runChatWithModel = async (
        model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'
      ) => {
        const chat = ai.chats.create({
          model,
          history: alignedHistory,
          config: {
            systemInstruction,
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: chatSchema,
          },
        });
        return withTimeout(
          chat.sendMessage({ message: userMessage }),
          14000,
          `Gemini Guide chat (${model})`
        );
      };

      let response;
      try {
        response = await runChatWithModel('gemini-4-hydrogen');
      } catch (primaryErr) {
        const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransient =
          /503|unavailable|high demand|overloaded|timed out|429|resource_exhausted/i.test(
            primaryMsg
          );
        if (!isTransient) {
          throw primaryErr;
        }
        response = await runChatWithModel('gemini-3.1-flash-lite');
      }

      const rawJson = (response.text ?? '{}')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(rawJson || '{}') as {
        reply?: string;
        suggestedPages?: string[];
        suggestedQuestions?: string[];
      };

      const validPages = (parsed.suggestedPages ?? []).filter((p): p is AppPageId =>
        VALID_GUIDE_PAGES.includes(p as AppPageId)
      );

      return res.json({
        reply:
          parsed.reply?.trim() ||
          buildFallbackGuideReply(userMessage, context).reply,
        suggestedPages: Array.from(new Set(validPages)).slice(0, 3),
        suggestedQuestions: (parsed.suggestedQuestions ?? []).slice(0, 3),
        source: 'gemini-chat',
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Unable to reach MedGuard Guide';
      let cleanMsg = rawMsg;
      try {
        const parsedErr = JSON.parse(rawMsg) as { error?: { message?: string } };
        if (parsedErr?.error?.message) {
          cleanMsg = parsedErr.error.message;
        }
      } catch {
        // Not JSON error payload
      }
      return res.status(502).json({ error: cleanMsg });
    }
  });

  // Vite dev middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedGuard server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
