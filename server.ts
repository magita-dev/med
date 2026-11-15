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

// In-memory store for Facility Watchlist & Pharmacist-Only Hypothesis Queue
let facilityStock: FacilityStockItem[] = [...INITIAL_FACILITY_STOCK];
let pharmacistQueue: PharmacistHypothesis[] = [...INITIAL_PHARMACIST_HYPOTHESES];

function parsePrescriptionLinesDeterministic(
  rawText: string,
  language: LanguageCode
): PrescriptionItem[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^rx:?$/i.test(l));

  const items: PrescriptionItem[] = [];
  const freqMap: Record<string, number> = {
    od: 1,
    hs: 1,
    stat: 1,
    bd: 2,
    bid: 2,
    tds: 3,
    tid: 3,
    qid: 4,
  };

  lines.forEach((line, idx) => {
    const cleaned = line
      .replace(/^\d+[\).\s-]+/, '')
      .replace(/^(tab|tablet|cap|capsule|syp|syrup|inj)\b\.?\s*/i, '')
      .trim();

    const strengthMatch = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/i);
    let strengthMg = strengthMatch ? Number(strengthMatch[1]) : 500;
    if (strengthMatch && strengthMatch[2].toLowerCase() === 'g') {
      strengthMg *= 1000;
    } else if (strengthMatch && strengthMatch[2].toLowerCase() === 'mcg') {
      strengthMg *= 0.001;
    }

    let frequencyPerDay = 1;
    const patternMatch = line.match(/\b(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?\b/);
    if (patternMatch) {
      frequencyPerDay =
        Number(patternMatch[1]) +
        Number(patternMatch[2]) +
        Number(patternMatch[3]) +
        (patternMatch[4] ? Number(patternMatch[4]) : 0);
    } else {
      const lower = line.toLowerCase();
      for (const [abbr, count] of Object.entries(freqMap)) {
        if (new RegExp(`\\b${abbr}\\b`, 'i').test(lower)) {
          frequencyPerDay = count;
          break;
        }
      }
    }

    const durMatch = line.match(/(?:x|for)\s*(\d+)\s*(days?|d|weeks?|wks?)/i);
    const durationDays = durMatch
      ? Number(durMatch[1]) * (durMatch[2].toLowerCase().startsWith('w') ? 7 : 1)
      : 5;

    const batchMatch = line.match(/batch[:\s#]*([A-Z0-9-]{4,})/i);
    const batchNumber = batchMatch ? batchMatch[1] : '';

    const namePart = cleaned
      .split(/\d+\s*(?:mg|mcg|g)|\(|—|-|\b(?:od|bd|tds|tid|qid|hs)\b/i)[0]
      .trim();
    const brandName = namePart || `Medicine ${idx + 1}`;

    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    const ingredientText = (parenMatch ? parenMatch[1] : brandName).toLowerCase();
    const activeIngredients = ingredientText
      .split(/\+|,|\/|\band\b/i)
      .map((s) => s.replace(/\d+\s*(?:mg|mcg|g)/gi, '').trim())
      .filter(Boolean);

    const route = /\bac\b/i.test(line)
      ? 'Oral before food (AC)'
      : /\bhs\b/i.test(line)
        ? 'Oral at bedtime (HS)'
        : 'Oral after food (PC)';

    const totalDailyMg = Math.round(strengthMg * Math.max(1, frequencyPerDay) * 100) / 100;
    const translatedLine =
      language === 'ta'
        ? `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} மி.கி, நாளொன்றுக்கு ${frequencyPerDay} முறை, ${durationDays} நாட்களுக்கு`
        : language === 'hi'
          ? `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} mg, दिन में ${frequencyPerDay} बार, ${durationDays} दिन`
          : `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} mg, ${frequencyPerDay}x/day for ${durationDays} days`;

    items.push({
      id: `rx-${Date.now()}-${idx + 1}`,
      brandName,
      activeIngredients: activeIngredients.length ? activeIngredients : [brandName.toLowerCase()],
      strengthMg,
      frequencyPerDay,
      totalDailyMg,
      durationDays,
      route,
      batchNumber,
      manufacturer: '',
      rawLine: line,
      translatedLine,
    });
  });

  return items;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'medguard-api' });
  });

  // 1. OCR & Structured Prescription Translation (AI reads & translates ONLY; never invents clinical alerts)
  app.post('/api/prescription/ocr-parse', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType,
        rawText,
        language = 'en',
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        rawText?: string;
        language?: LanguageCode;
      };

      const hasImage = Boolean(imageBase64 && mimeType);
      const ai = getAiClient();

      if (!ai) {
        if (!hasImage && rawText && rawText.trim()) {
          const items = parsePrescriptionLinesDeterministic(rawText, language);
          return res.json({
            items,
            extractedRawText: rawText,
            source: 'deterministic-parser',
          });
        }
        return res.status(503).json({
          error:
            'Image OCR requires GEMINI_API_KEY in Secrets. You can also paste prescription text directly into the editor.',
        });
      }

      const targetLangName =
        language === 'ta' ? 'Tamil' : language === 'hi' ? 'Hindi' : 'English';

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];
      if (hasImage && imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }
      parts.push({
        text: `You are a strictly bounded prescription & medicine-pack OCR extractor.
Extract ONLY the medicines, strengths (in mg), dosing frequencies per day, durations, batch numbers, manufacturers, and any printed diagnosis/patient age explicitly visible in ${
          hasImage ? 'this uploaded prescription or medicine strip image' : `this text:\n${rawText}`
        }.
IMPORTANT:
- Map brand names to their lowercase generic INN active ingredients (e.g. Dolo-650 -> ["paracetamol"], Pan-40 -> ["pantoprazole"], Augmentin -> ["amoxicillin"], Glycomet -> ["metformin"], Atorva -> ["atorvastatin"], Telma -> ["telmisartan"]).
- Convert shorthand like OD=1/day, BD=2/day, TDS/TID=3/day, QID=4/day, 1-0-1=2/day, 1-1-1=3/day, 2-2-2-2=8/day.
- Provide a plain-language translatedLine in ${targetLangName} for each medicine.
- Do NOT invent warnings or safety verdicts. If no medicines are legible in the image, return an empty items array.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'Extract printed or handwritten prescription medicines faithfully into JSON. Never add clinical warnings.',
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
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        extractedRawText?: string;
        detectedCondition?: string;
        detectedAge?: number;
        detectedWeightKg?: number;
        items?: Array<Partial<PrescriptionItem>>;
      };

      const items: PrescriptionItem[] = (parsed.items ?? []).map((item, idx) => {
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

      return res.json({
        items,
        extractedRawText: parsed.extractedRawText || (!hasImage ? rawText : '') || '',
        detectedCondition: parsed.detectedCondition || '',
        detectedAge: parsed.detectedAge || undefined,
        detectedWeightKg: parsed.detectedWeightKg || undefined,
        source: 'gemini-ocr',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR extraction failed';
      if (!req.body?.imageBase64 && req.body?.rawText) {
        const fallbackItems = parsePrescriptionLinesDeterministic(
          req.body.rawText,
          req.body.language || 'en'
        );
        return res.json({
          items: fallbackItems,
          extractedRawText: req.body.rawText,
          source: 'deterministic-fallback',
          warning: msg,
        });
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
    const report = verifyPrescription(items, patientCondition, Number(patientAge) || 45, weightVal);
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
2. summaryExplanation: plain-language summary of whether the prescription passed all checked rules (Safe) or needs review, citing exact findings and any retrieved pediatric RAG references (CDSCO National AEFI Guidelines, IAP Standard Treatment Guidelines, WHO Model Formulary for Children, WHO Pocket Book) from ragMatches.
3. cellularAlphaFoldNote: explain in 2-3 clear sentences how the primary target protein (${mech.name}, ${mech.structureId}, ${mech.provenance}) inside the cell's "${mech.cellularOrganelle}" relates to these medicines.
4. doctorQuestions: 3 concise, practical questions the patient can ask their doctor or pharmacist in ${targetLang}.
5. spokenScript: a warm 3-4 sentence voice-ready summary combining summaryExplanation and cellularAlphaFoldNote in ${targetLang}.

PRESCRIPTION ITEMS:
${JSON.stringify(items)}

VERIFIED REPORT + RETRIEVED RAG REFERENCES JSON:
${JSON.stringify(report)}`;

      const response = await ai.models.generateContent({
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
      });

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
