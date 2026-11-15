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

export interface ParsedPrescriptionResult {
  items: PrescriptionItem[];
  unparsedLines: string[];
}

const SLOTS_EN = ['morning', 'afternoon', 'night', 'bedtime'] as const;
const SLOTS_TA = ['காலை', 'மதியம்', 'இரவு', 'படுக்கும் முன்'] as const;
const SLOTS_HI = ['सुबह', 'दोपहर', 'रात', 'सोते समय'] as const;

export function buildSlotInstruction(params: {
  brandName: string;
  activeIngredients: string[];
  strengthMg: number;
  frequencyPerDay: number;
  durationDays: number;
  slots?: number[];
  modifiers?: string[];
  asNeeded?: boolean;
  language: LanguageCode;
}): string {
  const {
    brandName,
    activeIngredients,
    strengthMg,
    frequencyPerDay,
    durationDays,
    slots,
    modifiers = [],
    asNeeded,
    language,
  } = params;

  const ingLabel = activeIngredients.join(' + ');
  const parts: string[] = [];

  if (slots && slots.length > 0 && slots.some((n) => n > 0)) {
    slots.forEach((count, idx) => {
      if (!count || idx >= 4) return;
      if (language === 'ta') {
        parts.push(`${SLOTS_TA[idx]} ${count}`);
      } else if (language === 'hi') {
        parts.push(`${SLOTS_HI[idx]} ${count}`);
      } else {
        parts.push(idx === 3 ? `${count} at bedtime` : `${count} in the ${SLOTS_EN[idx]}`);
      }
    });
  } else if (asNeeded) {
    parts.push(
      language === 'ta'
        ? 'தேவைப்படும்போது மட்டும்'
        : language === 'hi'
          ? 'केवल ज़रूरत पड़ने पर'
          : 'only as needed'
    );
  } else {
    parts.push(
      language === 'ta'
        ? `நாளொன்றுக்கு ${frequencyPerDay} முறை`
        : language === 'hi'
          ? `दिन में ${frequencyPerDay} बार`
          : `${frequencyPerDay}x/day`
    );
  }

  for (const mod of modifiers) {
    if (mod === 'ac') {
      parts.push(
        language === 'ta'
          ? 'உணவுக்கு முன்'
          : language === 'hi'
            ? 'भोजन से पहले'
            : 'before food'
      );
    } else if (mod === 'pc') {
      parts.push(
        language === 'ta'
          ? 'உணவுக்குப் பின்'
          : language === 'hi'
            ? 'भोजन के बाद'
            : 'after food'
      );
    }
  }

  if (durationDays > 0) {
    parts.push(
      language === 'ta'
        ? `${durationDays} நாட்களுக்கு`
        : language === 'hi'
          ? `${durationDays} दिनों के लिए`
          : `for ${durationDays} days`
    );
  }

  const strengthText =
    language === 'ta' ? `${strengthMg} மி.கி` : `${strengthMg} mg`;
  return `${brandName} (${ingLabel}) — ${strengthText}: ${parts.join(', ')}`;
}

export function parsePrescriptionLinesWithUnparsed(
  rawText: string,
  language: LanguageCode
): ParsedPrescriptionResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const items: PrescriptionItem[] = [];
  const unparsedLines: string[] = [];
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
      if (!headerLinePattern.test(line) && line.length >= 4) {
        unparsedLines.push(line);
      }
      return;
    }
    if (headerLinePattern.test(line) && !hasKnownMedicine) {
      return;
    }

    const formMatch = line.match(
      /^(?:\d+[\).\s-]+)?(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|injection|drops|susp|suspension)\b/i
    );
    const formRaw = formMatch?.[1]?.toLowerCase() ?? '';
    const form = formRaw.startsWith('tab')
      ? 'tablet'
      : formRaw.startsWith('cap')
        ? 'capsule'
        : formRaw.startsWith('syp') || formRaw.startsWith('syr') || formRaw.startsWith('susp')
          ? 'syrup'
          : formRaw.startsWith('inj')
            ? 'injection'
            : formRaw
              ? formRaw
              : undefined;

    const cleaned = line
      .replace(/^[•*\-–]+\s*/, '')
      .replace(/^\d+[\).\s-]+/, '')
      .replace(/^(?:rx\b[:.\s]*)/i, '')
      .replace(/^(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|injection|drops|susp|suspension)\b\.?\s*/i, '')
      .trim();

    const strengthMatch = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b(?!\s*\/\s*kg)/i);
    let strengthMg = strengthMatch ? Number(strengthMatch[1]) : 500;
    if (strengthMatch && strengthMatch[2].toLowerCase() === 'g') {
      strengthMg *= 1000;
    } else if (strengthMatch && strengthMatch[2].toLowerCase() === 'mcg') {
      strengthMg *= 0.001;
    }

    let frequencyPerDay = 1;
    let slots: number[] | undefined;
    const xDayMatch = line.match(/(\d+)\s*(?:x|times)\s*(?:\/|\s*per\s*|\s*a\s*)(?:day|24\s*h|daily)/i);
    const patternMatch = line.match(/\b(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?\b/);
    if (xDayMatch) {
      frequencyPerDay = Math.max(1, Number(xDayMatch[1]));
    } else if (patternMatch) {
      slots = [
        Number(patternMatch[1]),
        Number(patternMatch[2]),
        Number(patternMatch[3]),
        ...(patternMatch[4] !== undefined ? [Number(patternMatch[4])] : []),
      ];
      frequencyPerDay = Math.max(
        1,
        slots.reduce((acc, n) => acc + n, 0)
      );
    } else {
      for (const [regex, count] of freqMap) {
        if (regex.test(line)) {
          frequencyPerDay = count;
          break;
        }
      }
    }

    const asNeeded = /\b(?:sos|prn)\b/i.test(line);
    const modifiers: string[] = [];
    if (/\bac\b|before\s+(?:food|meals?)/i.test(line)) modifiers.push('ac');
    if (/\bpc\b|after\s+(?:food|meals?)/i.test(line)) modifiers.push('pc');

    const durMatch = line.match(/(?:x|×|for)\s*(\d+)\s*(days?|d|weeks?|wks?)/i);
    const durationDays = durMatch
      ? Number(durMatch[1]) * (durMatch[2].toLowerCase().startsWith('w') ? 7 : 1)
      : 5;

    const batchMatch = line.match(/batch(?:\s*no\.?)?[:\s#]*([A-Z0-9-]{4,})/i);
    const batchNumber = batchMatch ? batchMatch[1] : '';

    const namePart = cleaned
      .split(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b|\(|—|\s+-\s+|\b(?:od|bd|bid|tds|tid|qid|hs|sos|prn|once|twice|thrice)\b/i)[0]
      .trim();
    const brandName = namePart || `Medicine ${idx + 1}`;

    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    const parenIsIngredient =
      parenMatch &&
      !/^(?:od|bd|bid|tds|tid|qid|hs|pc|ac|sos|prn|oral|\d+x\/day)$/i.test(parenMatch[1].trim());
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
    const translatedLine = buildSlotInstruction({
      brandName,
      activeIngredients,
      strengthMg,
      frequencyPerDay,
      durationDays,
      slots,
      modifiers,
      asNeeded,
      language,
    });

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
      form,
      slots,
      modifiers,
      asNeeded,
    });
  });

  return { items, unparsedLines };
}

export function parsePrescriptionLinesDeterministic(
  rawText: string,
  language: LanguageCode
): PrescriptionItem[] {
  return parsePrescriptionLinesWithUnparsed(rawText, language).items;
}

export interface OcrLineItem {
  text: string;
  confidence: number;
}

export async function extractDocumentTextLocally(params: {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}): Promise<{
  text: string;
  kind: 'text' | 'docx' | 'pdf' | 'image';
  isEmptyScannedPdf?: boolean;
  ocrLines?: OcrLineItem[];
}> {
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
  const rawText = (ocrResult?.data?.text || '').trim();
  const ocrLines: OcrLineItem[] = rawText
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({
      text: t,
      confidence: Math.max(0.5, Math.min(0.99, (ocrResult?.data?.confidence ?? 80) / 100)),
    }));
  return {
    text: rawText,
    kind: 'image',
    ocrLines,
  };
}
