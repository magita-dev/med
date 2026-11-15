import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';
import Tesseract from 'tesseract.js';
import { MEDICATION_RAG_DATABASE } from '../data/medicationDatabase.ts';
import type { LanguageCode, PrescriptionItem } from '../types/medguard.ts';

const BRAND_TO_INGREDIENTS: Record<string, string[]> = {
  // Common Indian & international prescription brands
  'dolo-650': ['paracetamol'],
  dolo: ['paracetamol'],
  calpol: ['paracetamol'],
  crocin: ['paracetamol'],
  'p-125': ['paracetamol'],
  'p-250': ['paracetamol'],
  pacimol: ['paracetamol'],
  tylenol: ['paracetamol'],
  brufen: ['ibuprofen'],
  ibugesic: ['ibuprofen'],
  advil: ['ibuprofen'],
  ecosprin: ['aspirin'],
  disprin: ['aspirin'],
  mox: ['amoxicillin'],
  novamox: ['amoxicillin'],
  augmentin: ['amoxicillin'],
  moxikind: ['amoxicillin'],
  azithral: ['azithromycin'],
  azee: ['azithromycin'],
  cetzine: ['cetirizine'],
  okacet: ['cetirizine'],
  zyrtec: ['cetirizine'],
  voveran: ['diclofenac'],
  reactin: ['diclofenac'],
  nise: ['nimesulide'],
  nimulid: ['nimesulide'],
  nicip: ['nimesulide'],
  sinarest: ['chlorpheniramine', 'phenylephrine', 'paracetamol'],
  wikoryl: ['chlorpheniramine', 'phenylephrine', 'paracetamol'],
  'solvin cold': ['chlorpheniramine', 'phenylephrine', 'paracetamol'],
  ascoril: ['chlorpheniramine'],
  perinorm: ['metoclopramide'],
  reglan: ['metoclopramide'],
  maxolon: ['metoclopramide'],
  clarimac: ['clarithromycin'],
  claribid: ['clarithromycin'],
  glycomet: ['metformin'],
  glucophage: ['metformin'],
  atorva: ['atorvastatin'],
  lipitor: ['atorvastatin'],
  simvotin: ['simvastatin'],
  zocor: ['simvastatin'],
  domstal: ['domperidone'],
  vomistop: ['domperidone'],
  pan: ['pantoprazole'],
  'pan-40': ['pantoprazole'],
  pantocid: ['pantoprazole'],
  omez: ['omeprazole'],
  telma: ['telmisartan'],
  amlokind: ['amlodipine'],
  stamlo: ['amlodipine'],
  taxim: ['cefixime'],
  zifi: ['cefixime'],
  ciplox: ['ciprofloxacin'],
  montair: ['montelukast'],
  atarax: ['hydroxyzine'],
  'etodolac-p': ['s(+) etodolac', 'paracetamol'],
};

for (const entry of MEDICATION_RAG_DATABASE) {
  for (const brand of entry.brand_examples) {
    const key = brand.toLowerCase().trim();
    if (!BRAND_TO_INGREDIENTS[key]) {
      BRAND_TO_INGREDIENTS[key] = [entry.active_ingredient.toLowerCase()];
    }
  }
}

const KNOWN_INGREDIENTS = [
  'paracetamol',
  'acetaminophen',
  'ibuprofen',
  'aspirin',
  'amoxicillin',
  'azithromycin',
  'cetirizine',
  'levocetirizine',
  'diclofenac',
  'nimesulide',
  'metoclopramide',
  'chlorpheniramine',
  'phenylephrine',
  'dextromethorphan',
  'clarithromycin',
  'simvastatin',
  'atorvastatin',
  'metformin',
  'glimepiride',
  'domperidone',
  'pantoprazole',
  'omeprazole',
  'amlodipine',
  'telmisartan',
  'losartan',
  'metoprolol',
  'ciprofloxacin',
  'cefixime',
  'montelukast',
  'hydroxyzine',
  'clopidogrel',
  's(+) etodolac',
  'etodolac',
];

function inferIngredients(brandOrLine: string, explicitParen?: string): string[] {
  const sourceText = (explicitParen || brandOrLine).toLowerCase();
  const explicitParts = explicitParen
    ? explicitParen
        .toLowerCase()
        .split(/\+|,|\/|\band\b/i)
        .map((s) => s.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)/gi, '').trim())
        .filter(Boolean)
    : [];

  if (explicitParts.length > 0) {
    const resolved = new Set<string>();
    for (const part of explicitParts) {
      if (part === 'acetaminophen') {
        resolved.add('paracetamol');
      } else {
        resolved.add(part);
      }
    }
    return Array.from(resolved);
  }

  const normalized = brandOrLine.toLowerCase();
  for (const [brandKey, ings] of Object.entries(BRAND_TO_INGREDIENTS)) {
    if (normalized.includes(brandKey)) {
      return ings;
    }
  }

  const matchedKnown = KNOWN_INGREDIENTS.filter((ing) => normalized.includes(ing));
  if (matchedKnown.length > 0) {
    return matchedKnown.map((ing) => (ing === 'acetaminophen' ? 'paracetamol' : ing));
  }

  const cleanedFallback = sourceText
    .replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, '')
    .replace(/\b(?:tab|tablet|cap|capsule|syp|syrup|inj|drops|suspension)\b/gi, '')
    .trim();

  return cleanedFallback ? [cleanedFallback] : ['unknown'];
}

export function extractPatientContextFromText(rawText: string): {
  detectedCondition: string;
  detectedAge?: number;
  detectedWeightKg?: number;
} {
  let detectedCondition = '';
  let detectedAge: number | undefined;
  let detectedWeightKg: number | undefined;

  const condMatch = rawText.match(
    /(?:diagnosis|condition|indication|complaints?|c\/o|reason)\s*[:\-]\s*([^\r\n;]+)/i
  );
  if (condMatch) {
    detectedCondition = condMatch[1].trim().slice(0, 120);
  }

  const ageYearsMatch = rawText.match(
    /(?:age\s*[:\-]?\s*|\bpatient\s+age\s*[:\-]?\s*|\b)(\d{1,3}(?:\.\d+)?)\s*(?:yrs?|years?|y\/o)\b/i
  );
  if (ageYearsMatch) {
    detectedAge = Number(ageYearsMatch[1]);
  } else {
    const ageMonthsMatch = rawText.match(
      /(?:age\s*[:\-]?\s*|\b)(\d{1,2}(?:\.\d+)?)\s*(?:mos?|months?)\b/i
    );
    if (ageMonthsMatch) {
      detectedAge = Math.round((Number(ageMonthsMatch[1]) / 12) * 100) / 100;
    }
  }

  const weightMatch = rawText.match(
    /(?:weight|wt)\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*kg\b|\b(\d{1,3}(?:\.\d+)?)\s*kg\b/i
  );
  if (weightMatch) {
    const w = Number(weightMatch[1] || weightMatch[2]);
    if (w > 0 && w <= 250) {
      detectedWeightKg = w;
    }
  }

  return { detectedCondition, detectedAge, detectedWeightKg };
}

export function parsePrescriptionLinesDeterministic(
  rawText: string,
  language: LanguageCode
): PrescriptionItem[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const items: PrescriptionItem[] = [];
  const freqMap: Array<[RegExp, number]> = [
    [/\b(?:od|once\s+daily|once\s+a\s+day|hs|at\s+bedtime|stat|every\s+24\s*h)\b/i, 1],
    [/\b(?:bd|bid|twice\s+daily|twice\s+a\s+day|every\s+12\s*h)\b/i, 2],
    [/\b(?:tds|tid|thrice\s+daily|three\s+times|every\s+8\s*h)\b/i, 3],
    [/\b(?:qid|four\s+times|every\s+6\s*h)\b/i, 4],
    [/\bevery\s+4\s*[-–]?\s*6\s*h/i, 4],
    [/\bevery\s+4\s*h/i, 6],
  ];

  const headerLinePattern =
    /^(?:rx:?|patient(?:\s+name)?|name|doctor|dr\.|date|clinic|hospital|address|phone|mob|tel|diagnosis|condition|indication|age|weight|wt|signature|gender|sex|reg\.?\s*no|uhid)\b/i;

  lines.forEach((line, idx) => {
    const hasStrengthOrForm =
      /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b/i.test(line) ||
      /^\s*(?:\d+[\).\s-]+)?(?:tab|tablet|cap|capsule|syp|syrup|inj|drops|susp)\b/i.test(line);
    const hasKnownMedicine =
      KNOWN_INGREDIENTS.some((ing) => line.toLowerCase().includes(ing)) ||
      Object.keys(BRAND_TO_INGREDIENTS).some((b) => line.toLowerCase().includes(b));

    if (!hasStrengthOrForm && !hasKnownMedicine) {
      return;
    }
    if (headerLinePattern.test(line) && !hasKnownMedicine) {
      return;
    }

    const cleaned = line
      .replace(/^[•*\-–]+\s*/, '')
      .replace(/^\d+[\).\s-]+/, '')
      .replace(/^(?:rx\b[:.\s]*)/i, '')
      .replace(/^(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|drops|susp|suspension)\b\.?\s*/i, '')
      .trim();

    const strengthMatch = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b(?!\s*\/\s*kg)/i);
    let strengthMg = strengthMatch ? Number(strengthMatch[1]) : 500;
    if (strengthMatch && strengthMatch[2].toLowerCase() === 'g') {
      strengthMg *= 1000;
    } else if (strengthMatch && strengthMatch[2].toLowerCase() === 'mcg') {
      strengthMg *= 0.001;
    }

    let frequencyPerDay = 1;
    const xDayMatch = line.match(/(\d+)\s*(?:x|times)\s*(?:\/|\s*per\s*|\s*a\s*)(?:day|24\s*h|daily)/i);
    const patternMatch = line.match(/\b(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?\b/);
    if (xDayMatch) {
      frequencyPerDay = Math.max(1, Number(xDayMatch[1]));
    } else if (patternMatch) {
      frequencyPerDay = Math.max(
        1,
        Number(patternMatch[1]) +
          Number(patternMatch[2]) +
          Number(patternMatch[3]) +
          (patternMatch[4] ? Number(patternMatch[4]) : 0)
      );
    } else {
      for (const [regex, count] of freqMap) {
        if (regex.test(line)) {
          frequencyPerDay = count;
          break;
        }
      }
    }

    const durMatch = line.match(/(?:x|for)\s*(\d+)\s*(days?|d|weeks?|wks?)/i);
    const durationDays = durMatch
      ? Number(durMatch[1]) * (durMatch[2].toLowerCase().startsWith('w') ? 7 : 1)
      : 5;

    const batchMatch = line.match(/batch(?:\s*no\.?)?[:\s#]*([A-Z0-9-]{4,})/i);
    const batchNumber = batchMatch ? batchMatch[1] : '';

    const namePart = cleaned
      .split(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b|\(|—|\s+-\s+|\b(?:od|bd|bid|tds|tid|qid|hs|sos|once|twice|thrice)\b/i)[0]
      .trim();
    const brandName = namePart || `Medicine ${idx + 1}`;

    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    const parenIsIngredient =
      parenMatch &&
      !/^(?:od|bd|bid|tds|tid|qid|hs|pc|ac|sos|oral|\d+x\/day)$/i.test(parenMatch[1].trim());
    const activeIngredients = inferIngredients(
      cleaned,
      parenIsIngredient ? parenMatch[1] : undefined
    );

    const route = /\bac\b|before\s+(?:food|meals?)/i.test(line)
      ? 'Oral before food (AC)'
      : /\bhs\b|bedtime/i.test(line)
        ? 'Oral at bedtime (HS)'
        : /\bsyp|syrup|susp|suspension|drops\b/i.test(line)
          ? 'Oral liquid / suspension'
          : 'Oral after food (PC)';

    const totalDailyMg = Math.round(strengthMg * Math.max(1, frequencyPerDay) * 100) / 100;
    const translatedLine =
      language === 'ta'
        ? `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} மி.கி, நாளொன்றுக்கு ${frequencyPerDay} முறை, ${durationDays} நாட்களுக்கு`
        : language === 'hi'
          ? `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} mg, दिन में ${frequencyPerDay} बार, ${durationDays} दिन`
          : `${brandName} (${activeIngredients.join(' + ')}) — ${strengthMg} mg, ${frequencyPerDay}x/day for ${durationDays} days`;

    items.push({
      id: `rx-${Date.now()}-${items.length + 1}`,
      brandName,
      activeIngredients,
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

export async function extractDocumentTextLocally(params: {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}): Promise<{ text: string; kind: 'text' | 'docx' | 'pdf' | 'image'; isEmptyScannedPdf?: boolean }> {
  const { base64Data, mimeType, fileName = '' } = params;
  const lowerMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  const buffer = Buffer.from(base64Data, 'base64');

  // 1. Plain text / CSV / Markdown / JSON / HTML / XML / RTF
  if (
    lowerMime.startsWith('text/') ||
    lowerMime === 'application/json' ||
    lowerMime === 'application/rtf' ||
    /\.(txt|csv|md|markdown|json|log|rtf|html?|xml)$/i.test(lowerName)
  ) {
    let text = buffer.toString('utf8');
    if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerName.endsWith('.xml')) {
      text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (lowerName.endsWith('.rtf') || lowerMime === 'application/rtf') {
      text = text
        .replace(/\\[a-z]+\d*\s?/gi, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return { text: text.trim(), kind: 'text' };
  }

  // 2. Microsoft Word (.docx)
  if (
    lowerMime.includes('wordprocessingml') ||
    lowerName.endsWith('.docx')
  ) {
    const res = await mammoth.extractRawText({ buffer });
    return { text: (res.value || '').trim(), kind: 'docx' };
  }

  // 3. PDF (.pdf)
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    const res = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    const raw = Array.isArray(res.text) ? res.text.join('\n') : String(res.text || '');
    const cleaned = raw.trim();
    return {
      text: cleaned,
      kind: 'pdf',
      isEmptyScannedPdf: cleaned.length < 10,
    };
  }

  // 4. Image OCR via Tesseract.js fallback
  const ocrResult = await Tesseract.recognize(buffer, 'eng');
  return {
    text: (ocrResult?.data?.text || '').trim(),
    kind: 'image',
  };
}
