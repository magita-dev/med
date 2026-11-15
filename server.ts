import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  INITIAL_FACILITY_STOCK,
  INITIAL_PHARMACIST_HYPOTHESES,
  MECHANISM_TARGETS,
  REGULATOR_ALERTS,
} from './src/data/medguardCatalog.ts';
import {
  CLINICAL_RAG_SOURCES,
  RAG_CLINICAL_RECORDS,
} from './src/data/pediatricRagDataset.ts';
import {
  buildDeterministicExplanation,
  reverseMatchFacilityStock,
  verifyPrescription,
} from './src/shared/verifier.ts';
import {
  extractDocumentTextLocally,
  extractPatientContextFromText,
  parsePrescriptionLinesDeterministic,
} from './src/server/documentExtractor.ts';
import type {
  FacilityStockItem,
  LanguageCode,
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

// In-memory store for Facility Watchlist & Pharmacist-Only Hypothesis Queue
let facilityStock: FacilityStockItem[] = [...INITIAL_FACILITY_STOCK];
let pharmacistQueue: PharmacistHypothesis[] = [...INITIAL_PHARMACIST_HYPOTHESES];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'medguard-api' });
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
          const items = extracted
            ? parsePrescriptionLinesDeterministic(extracted, language)
            : [];
          const ctx = extractPatientContextFromText(extracted);
          return res.json({
            items,
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
          const items = parsePrescriptionLinesDeterministic(textToParse, language);
          const ctx = extractPatientContextFromText(textToParse);
          return res.json({
            items,
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

      if (items.length === 0 && finalExtractedText.trim()) {
        items = parsePrescriptionLinesDeterministic(finalExtractedText, language);
      }

      return res.json({
        items,
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
        }
        if (fallbackText.trim()) {
          const fallbackItems = parsePrescriptionLinesDeterministic(fallbackText, language);
          const ctx = extractPatientContextFromText(fallbackText);
          return res.json({
            items: fallbackItems,
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

  // 2. Deterministic Verification Engine (Regulator Pack Check + Dosage + Disease Match + Pediatric RAG + Regimen)
  app.post('/api/prescription/verify', (req, res) => {
    const {
      items = [],
      patientCondition = '',
      patientAge = 45,
      patientWeightKg,
    } = req.body as {
      items?: PrescriptionItem[];
      patientCondition?: string;
      patientAge?: number;
      patientWeightKg?: number;
    };

    const weightVal =
      typeof patientWeightKg === 'number' && patientWeightKg > 0
        ? patientWeightKg
        : Number(patientWeightKg) > 0
          ? Number(patientWeightKg)
          : undefined;
    const parsedAge = Number(patientAge);
    const safeAge = Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge : 45;
    const report = verifyPrescription(items, patientCondition, safeAge, weightVal);
    res.json(report);
  });

  // 2b. Searchable Pediatric Clinical RAG Knowledge Base (CDSCO / IAP / WHO)
  app.get('/api/rag/records', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const status = String(req.query.status ?? '').trim().toUpperCase();
    const records = RAG_CLINICAL_RECORDS.filter((r) => {
      const matchesStatus = !status || status === 'ALL' || r.safety_status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        r.medicine_name.toLowerCase().includes(q) ||
        r.active_ingredient.toLowerCase().includes(q) ||
        r.brand_examples.some((b) => b.toLowerCase().includes(q)) ||
        r.source.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
    res.json({
      sources: CLINICAL_RAG_SOURCES,
      records,
      totalCount: RAG_CLINICAL_RECORDS.length,
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
2. summaryExplanation: plain-language summary of whether the prescription passed all checked rules (Safe) or needs review/unsafe action, explicitly naming the authoritative sources from report.validationSources (e.g., NIH DailyMed FDA label, RCSB PDB, Mol* AlphaFold DB, CDSCO National AEFI Guidelines, IAP STG, WHO Formulary) and any retrieved pediatric RAG references from ragMatches.
3. cellularAlphaFoldNote: explain in 2-3 clear sentences how the primary target protein (${mech.name}, ${mech.structureId}, ${mech.provenance}) inside the cell's "${mech.cellularOrganelle}" relates to these medicines, citing ${mech.rcsbStructureUrl} and ${mech.alphafoldViewerUrl}.
4. doctorQuestions: 3 concise, practical questions the patient can ask their doctor or pharmacist in ${targetLang}.
5. spokenScript: a warm 3-4 sentence voice-ready summary combining summaryExplanation and cellularAlphaFoldNote in ${targetLang}.

PRESCRIPTION ITEMS:
${JSON.stringify(items)}

VERIFIED REPORT + RETRIEVED RAG REFERENCES JSON:
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

  // 6. Pharmacist-Only Structure Hypothesis Queue (patientVisible: false)
  app.get('/api/pharmacist/hypotheses', (_req, res) => {
    res.json({ hypotheses: pharmacistQueue });
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
