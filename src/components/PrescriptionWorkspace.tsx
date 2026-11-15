import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Languages,
  Microscope,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { DOSE_RULES, SAMPLE_PRESETS } from '../data/medguardCatalog.ts';
import { saveVerificationCheck } from '../firebase.ts';
import type {
  ConditionAgeDosageEvaluation,
  LanguageCode,
  MechanismTargetId,
  MultilingualExplanation,
  PrescriptionItem,
  SamplePreset,
  VerificationReport,
} from '../types/medguard.ts';

export interface SafeDailyLimitRecord {
  ingredient: string;
  adultMaxDailyMg: number;
  elderlyMaxDailyMg: number;
  source: string;
}

export const SAFE_DAILY_LIMITS_DB: Record<string, SafeDailyLimitRecord> = Object.fromEntries(
  DOSE_RULES.map((r) => [
    r.ingredient,
    {
      ingredient: r.ingredient,
      adultMaxDailyMg: r.adultMaxDailyMg,
      elderlyMaxDailyMg: r.elderlyMaxDailyMg,
      source: r.source,
    },
  ])
);

export interface DosageExceedance {
  itemId: string;
  brandName: string;
  ingredient: string;
  detectedDailyMg: number;
  safeDailyLimitMg: number;
  excessMg: number;
  source: string;
}

export function validateDetectedDosages(
  rxItems: PrescriptionItem[],
  age: number
): DosageExceedance[] {
  const isElderly = age >= 65;
  const exceedances: DosageExceedance[] = [];

  for (const item of rxItems) {
    const primaryIngredient = (item.activeIngredients[0] || item.brandName)
      .trim()
      .toLowerCase();
    const limitEntry =
      SAFE_DAILY_LIMITS_DB[primaryIngredient] ??
      Object.values(SAFE_DAILY_LIMITS_DB).find((entry) =>
        primaryIngredient.includes(entry.ingredient)
      );

    if (!limitEntry) continue;

    const detectedDailyMg =
      Math.round(
        (item.totalDailyMg ||
          (Number(item.strengthMg) || 0) * Math.max(1, Number(item.frequencyPerDay) || 1)) *
          100
      ) / 100;
    const safeDailyLimitMg = isElderly
      ? limitEntry.elderlyMaxDailyMg
      : limitEntry.adultMaxDailyMg;

    if (detectedDailyMg > safeDailyLimitMg) {
      exceedances.push({
        itemId: item.id,
        brandName: item.brandName,
        ingredient: limitEntry.ingredient,
        detectedDailyMg,
        safeDailyLimitMg,
        excessMg: Math.round((detectedDailyMg - safeDailyLimitMg) * 100) / 100,
        source: limitEntry.source,
      });
    }
  }

  return exceedances;
}

export function DosageWarning({
  exceedances,
  language,
}: {
  exceedances: DosageExceedance[];
  language: LanguageCode;
}) {
  if (exceedances.length === 0) return null;

  return (
    <div
      role="alert"
      aria-label="Dosage Warning"
      className="rounded-xl p-4 bg-[#FCEBEF] border border-[#E2A9B3] space-y-2.5"
    >
      <div className="flex items-center gap-2 text-[#8B152A] font-semibold text-sm">
        <ShieldAlert className="w-5 h-5 text-[#B4233C] shrink-0" />
        <span>
          {language === 'ta'
            ? 'Dosage Warning — அளவு எச்சரிக்கை: பரிந்துரைக்கப்பட்ட தினசரி வரம்பை மீறுகிறது'
            : language === 'hi'
              ? 'Dosage Warning — खुराक चेतावनी: सुरक्षित दैनिक सीमा से अधिक'
              : 'Dosage Warning — Safe Daily Limit Exceeded'}
        </span>
      </div>
      <div className="space-y-2">
        {exceedances.map((ex) => (
          <div
            key={ex.itemId}
            className="rounded-lg bg-[#FCF9F4] border border-[#E6B8C1] px-3 py-2 text-xs space-y-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#1E221D]">
                {ex.brandName} ({ex.ingredient})
              </span>
              <span className="font-mono text-[#8B152A] font-semibold">
                {ex.detectedDailyMg} mg/day · Limit {ex.safeDailyLimitMg} mg/day (+{ex.excessMg} mg)
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#555A50]">
              Guideline Source: {ex.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface RegulatoryDosageEvaluation {
  status: 'Caution' | 'Within Guidelines';
  flaggedItems: Array<{
    itemId: string;
    brandName: string;
    ingredient: string;
    prescribedDailyMg: number;
    frequencyPerDay: number;
    recommendedRangeLabel: string;
    reason: string;
    source: string;
  }>;
  localExplanation: string;
}

export function evaluatePrescribedDosageAgainstGuidelines(
  rxItems: PrescriptionItem[],
  age: number,
  lang: LanguageCode
): RegulatoryDosageEvaluation {
  const isElderly = age >= 65;
  const flaggedItems: RegulatoryDosageEvaluation['flaggedItems'] = [];

  for (const item of rxItems) {
    const primaryIngredient = (item.activeIngredients[0] || item.brandName)
      .trim()
      .toLowerCase();
    const rule = DOSE_RULES.find(
      (r) =>
        r.ingredient === primaryIngredient ||
        primaryIngredient.includes(r.ingredient)
    );

    const frequency = Number(item.frequencyPerDay) || 0;
    const prescribedDailyMg =
      Math.round((Number(item.strengthMg) || 0) * Math.max(0, frequency) * 100) / 100;

    if (frequency <= 0 || frequency > 6) {
      flaggedItems.push({
        itemId: item.id,
        brandName: item.brandName,
        ingredient: primaryIngredient,
        prescribedDailyMg,
        frequencyPerDay: frequency,
        recommendedRangeLabel: rule?.typicalRangeLabel ?? '1–4 doses/day per standard label',
        reason: `Prescribed frequency (${frequency}x/day) falls outside typical 1–6 doses/day clinical bounds.`,
        source: rule?.source ?? 'MedGuard Standard Dosing Frequency Guideline',
      });
      continue;
    }

    if (!rule) {
      flaggedItems.push({
        itemId: item.id,
        brandName: item.brandName,
        ingredient: primaryIngredient,
        prescribedDailyMg,
        frequencyPerDay: frequency,
        recommendedRangeLabel: 'Unverified in curated daily limit catalog',
        reason: `No verified regulatory daily dose ceiling rule found for "${primaryIngredient}". Confirm dosage manually with a pharmacist.`,
        source: 'MedGuard Curated Monograph Coverage',
      });
      continue;
    }

    const maxAllowed = isElderly ? rule.elderlyMaxDailyMg : rule.adultMaxDailyMg;
    if (prescribedDailyMg > maxAllowed) {
      flaggedItems.push({
        itemId: item.id,
        brandName: item.brandName,
        ingredient: rule.ingredient,
        prescribedDailyMg,
        frequencyPerDay: frequency,
        recommendedRangeLabel: rule.typicalRangeLabel,
        reason: `${prescribedDailyMg} mg/day (${frequency}x/day) exceeds the ${
          isElderly ? 'elderly (≥65)' : 'adult'
        } regulatory limit of ${maxAllowed} mg/day.`,
        source: rule.source,
      });
    } else if (prescribedDailyMg > 0 && prescribedDailyMg < rule.minDailyMg) {
      flaggedItems.push({
        itemId: item.id,
        brandName: item.brandName,
        ingredient: rule.ingredient,
        prescribedDailyMg,
        frequencyPerDay: frequency,
        recommendedRangeLabel: rule.typicalRangeLabel,
        reason: `${prescribedDailyMg} mg/day (${frequency}x/day) is below the typical minimum daily dose of ${rule.minDailyMg} mg/day.`,
        source: rule.source,
      });
    }
  }

  if (flaggedItems.length === 0) {
    return {
      status: 'Within Guidelines',
      flaggedItems: [],
      localExplanation:
        lang === 'ta'
          ? 'பரிந்துரைக்கப்பட்ட அளவு மற்றும் தினசரி எண்ணிக்கை நிலையான ஒழுங்குமுறை வரம்புகளுக்குள் உள்ளது.'
          : lang === 'hi'
            ? 'निर्धारित खुराक और दैनिक आवृत्ति मानक नियामक सीमा के भीतर है।'
            : 'Prescribed dosage and daily frequency fall within standard regulatory limits.',
    };
  }

  const summaryList = flaggedItems
    .map((f) => `${f.brandName} (${f.prescribedDailyMg} mg/day, ${f.frequencyPerDay}x/day)`)
    .join('; ');

  const localExplanation =
    lang === 'ta'
      ? `எச்சரிக்கை (Caution): ${summaryList} — பரிந்துரைக்கப்பட்ட தினசரி அளவு அல்லது எண்ணிக்கை நிலையான ஒழுங்குமுறை வரம்பிற்கு வெளியே உள்ளது. மருந்தை மாற்றுவதற்கு முன் மருத்துவரிடம் அல்லது மருந்தாளரிடம் சரிபார்க்கவும்.`
      : lang === 'hi'
        ? `सावधानी (Caution): ${summaryList} — निर्धारित दैनिक खुराक या आवृत्ति मानक नियामक सीमा से बाहर है। कृपया डॉक्टर या फ़ार्मासिस्ट से इसकी पुष्टि करें।`
        : `Caution: ${summaryList} falls outside recommended daily regulatory limits (${flaggedItems[0].reason}). Verify with your prescriber or pharmacist.`;

  return {
    status: 'Caution',
    flaggedItems,
    localExplanation,
  };
}

interface PrescriptionWorkspaceProps {
  language: LanguageCode;
  userId?: string | null;
  selectedPreset?: {
    preset: SamplePreset;
    autoVerify: boolean;
    nonce: number;
  } | null;
  onLanguageChange: (lang: LanguageCode) => void;
  onReportReady: (report: VerificationReport) => void;
  onSavedCheck?: () => void;
  onOpenMechanism: (targetId: MechanismTargetId) => void;
  onOpenCellView: () => void;
  onOpenTestCases?: () => void;
}

const UI_TEXT: Record<
  LanguageCode,
  {
    uploadTitle: string;
    uploadHint: string;
    conditionLabel: string;
    ageLabel: string;
    extractBtn: string;
    verifyBtn: string;
    confirmText: string;
    translatedTitle: string;
    voiceBtn: string;
    stopVoice: string;
    questionsTitle: string;
    whyBtn: string;
    cellBtn: string;
  }
> = {
  en: {
    uploadTitle: 'Upload Prescription Photo or Document (PDF / DOCX / TXT)',
    uploadHint: 'Supports printed/handwritten photos, PDFs, Word (.docx), and text files. Or paste lines below.',
    conditionLabel: 'Diagnosed Disease / Condition',
    ageLabel: 'Patient Age (years)',
    extractBtn: 'Read & Translate Lines',
    verifyBtn: 'Verify Dosage, Disease & Safety',
    confirmText: 'I confirm these medicine names, strengths, and doses match the prescription.',
    translatedTitle: 'Translated Prescription Instructions',
    voiceBtn: 'Listen to Explanation',
    stopVoice: 'Stop Audio',
    questionsTitle: 'Questions for Your Doctor or Pharmacist',
    whyBtn: 'Why? Inspect AlphaFold 3D',
    cellBtn: 'See Inside Cell',
  },
  ta: {
    uploadTitle: 'மருந்துச்சீட்டு அல்லது மாத்திரை அட்டைப் படத்தை பதிவேற்றவும்',
    uploadHint: 'அச்சிடப்பட்ட அல்லது கையெழுத்து மருந்துச்சீட்டைப் பதிவேற்றலாம் அல்லது கீழே உள்ள மாதிரியைத் தேர்ந்தெடுக்கலாம்.',
    conditionLabel: 'நோய் / உடல்நலப் பிரச்சனை',
    ageLabel: 'நோயாளியின் வயது',
    extractBtn: 'படித்து தமிழ் மொழிபெயர்ப்பு செய்',
    verifyBtn: 'அளவு, நோய் பொருத்தம் & பாதுகாப்பு சரிபார்',
    confirmText: 'மருந்துப் பெயர்கள் மற்றும் அளவுகள் மருந்துச்சீட்டுடன் பொருந்துவதை உறுதிப்படுத்துகிறேன்.',
    translatedTitle: 'தமிழில் மருந்து எடுத்துக்கொள்ளும் வழிமுறை',
    voiceBtn: 'தமிழில் விளக்கத்தைக் கேளுங்கள்',
    stopVoice: 'ஒலியை நிறுத்து',
    questionsTitle: 'மருத்துவர் அல்லது மருந்தாளரிடம் கேட்க வேண்டிய கேள்விகள்',
    whyBtn: 'ஏன்? AlphaFold 3D பார்வை',
    cellBtn: 'செல்லின் உள்ளே பார்',
  },
  hi: {
    uploadTitle: 'प्रिस्क्रिप्शन या दवा स्ट्रिप की फोटो अपलोड करें',
    uploadHint: 'प्रिंटेड या हस्तलिखित पर्चे की फोटो डालें या नीचे दिया नमूना चुनें।',
    conditionLabel: 'रोग / लक्षण (जिसके लिए दवा दी गई है)',
    ageLabel: 'रोगी की आयु (वर्ष)',
    extractBtn: 'पढ़ें और अनुवाद करें',
    verifyBtn: 'खुराक, बीमारी और सुरक्षा जाँचें',
    confirmText: 'मैं पुष्टि करता हूँ कि दवाओं के नाम और खुराक पर्चे से मेल खाते हैं।',
    translatedTitle: 'सरल भाषा में दवा लेने के निर्देश',
    voiceBtn: 'आवाज़ में समझें',
    stopVoice: 'आवाज़ रोकें',
    questionsTitle: 'डॉक्टर या फ़ार्मासिस्ट से पूछने के लिए प्रश्न',
    whyBtn: 'क्यों? AlphaFold 3D देखें',
    cellBtn: 'कोशिका के अंदर देखें',
  },
};

export function PrescriptionWorkspace({
  language,
  userId,
  selectedPreset,
  onLanguageChange,
  onReportReady,
  onSavedCheck,
  onOpenMechanism,
  onOpenCellView,
  onOpenTestCases,
}: PrescriptionWorkspaceProps) {
  const t = UI_TEXT[language];
  const initial = selectedPreset?.preset ?? SAMPLE_PRESETS[0];

  const [rawText, setRawText] = useState(initial.rawPrescriptionText);
  const [patientCondition, setPatientCondition] = useState(initial.patientCondition);
  const [patientAge, setPatientAge] = useState(String(initial.patientAge));
  const [patientWeightKg, setPatientWeightKg] = useState('');
  const [items, setItems] = useState<PrescriptionItem[]>(initial.items);
  const [confirmed, setConfirmed] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadedDocName, setUploadedDocName] = useState<string>('');

  const [report, setReport] = useState<VerificationReport | null>(null);
  const [explanation, setExplanation] = useState<MultilingualExplanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedAgeNum = Number(patientAge);
  const effectiveAgeNum =
    patientAge.trim() !== '' && Number.isFinite(parsedAgeNum) && parsedAgeNum >= 0
      ? parsedAgeNum
      : 45;

  const dosageEvaluation = useMemo(
    () =>
      evaluatePrescribedDosageAgainstGuidelines(
        items,
        effectiveAgeNum,
        language
      ),
    [items, effectiveAgeNum, language]
  );

  const dosageExceedances = useMemo(
    () => validateDetectedDosages(items, effectiveAgeNum),
    [items, effectiveAgeNum]
  );

  const [scanRagEvaluation, setScanRagEvaluation] =
    useState<ConditionAgeDosageEvaluation | null>(null);

  const triggerLocalExplanation = async (
    currentItems: PrescriptionItem[],
    currentReport: VerificationReport,
    targetLang: LanguageCode
  ) => {
    const explainRes = await fetch('/api/prescription/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: currentItems,
        report: currentReport,
        language: targetLang,
      }),
    });
    const explainData: MultilingualExplanation = await explainRes.json();
    setExplanation(explainData);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!selectedPreset) return;
    const { preset, autoVerify } = selectedPreset;
    stopAudio();
    setPreviewUrl('');
    setUploadedDocName('');
    setRawText(preset.rawPrescriptionText);
    setPatientCondition(preset.patientCondition);
    setPatientAge(String(preset.patientAge));
    const defaultWeight =
      preset.id === 'pediatric-rag-caution'
        ? '14'
        : preset.id === 'pediatric-amoxicillin-weight'
          ? '16'
          : '';
    setPatientWeightKg(defaultWeight);
    const clonedItems = preset.items.map((x) => ({ ...x }));
    setItems(clonedItems);
    setConfirmed(true);
    setReport(null);
    setScanRagEvaluation(null);
    setExplanation(null);
    setSaveState('idle');
    setError('');

    if (autoVerify) {
      setBusy(true);
      void runVerification(
        clonedItems,
        preset.patientCondition,
        preset.patientAge,
        language,
        defaultWeight ? Number(defaultWeight) : undefined
      )
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Verification failed');
        })
        .finally(() => setBusy(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset?.nonce]);

  const runVerification = async (
    targetItems: PrescriptionItem[],
    conditionVal: string,
    ageVal: number,
    activeLang: LanguageCode,
    weightVal?: number
  ) => {
    if (!targetItems.length) return;
    const guidelineEval = evaluatePrescribedDosageAgainstGuidelines(
      targetItems,
      ageVal,
      activeLang
    );

    const payload = {
      items: targetItems,
      patientCondition: conditionVal,
      patientAge: ageVal,
      patientWeightKg: weightVal && weightVal > 0 ? weightVal : undefined,
    };

    const [verifyRes, ragEvalRes] = await Promise.all([
      fetch('/api/prescription/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      fetch('/api/rag/evaluate-dosage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ]);

    const verifiedReport: VerificationReport = await verifyRes.json();
    if (!verifyRes.ok) throw new Error('Verification failed');

    if (ragEvalRes.ok) {
      const ragData = (await ragEvalRes.json()) as {
        evaluation?: ConditionAgeDosageEvaluation;
      };
      setScanRagEvaluation(ragData.evaluation ?? null);
    } else {
      setScanRagEvaluation(null);
    }

    if (
      guidelineEval.status === 'Caution' &&
      verifiedReport.overallVerdict === 'SAFE_TO_TAKE'
    ) {
      verifiedReport.overallVerdict = 'CAUTION_REVIEW';
      verifiedReport.verdictHeadline = 'Caution — Dosage or Frequency Outside Guidelines';
      verifiedReport.verdictQualifier = guidelineEval.localExplanation;
    }

    setSaveState('idle');
    setReport(verifiedReport);
    onReportReady(verifiedReport);
    await triggerLocalExplanation(targetItems, verifiedReport, activeLang);
  };

  const handleSaveToAccount = async () => {
    if (!userId || !report || saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    try {
      await saveVerificationCheck(
        userId,
        report,
        items.map((i) => `${i.brandName} ${i.strengthMg}mg`)
      );
      setSaveState('saved');
      onSavedCheck?.();
    } catch (e) {
      setSaveState('idle');
      setError(e instanceof Error ? e.message : 'Unable to save verification check');
    }
  };

  const handleImageUpload = async (file: File) => {
    stopAudio();
    setError('');
    setBusy(true);
    setReport(null);
    setScanRagEvaluation(null);
    setExplanation(null);
    setSaveState('idle');
    setRawText('');
    setItems([]);
    setPreviewUrl('');
    setUploadedDocName(file.name);

    try {
      const lowerName = file.name.toLowerCase();
      const isPlainTextFile =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.(txt|csv|md|markdown|json|log)$/i.test(lowerName);

      let data: {
        items?: PrescriptionItem[];
        extractedRawText?: string;
        detectedCondition?: string;
        detectedAge?: number;
        detectedWeightKg?: number;
        error?: string;
      };

      if (isPlainTextFile) {
        const textContent = await file.text();
        setRawText(textContent);
        const res = await fetch('/api/prescription/ocr-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: textContent,
            fileName: file.name,
            mimeType: file.type || 'text/plain',
            language,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Document parsing failed');
      } else {
        const reader = new FileReader();
        const base64Full: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read uploaded file'));
          reader.readAsDataURL(file);
        });

        const [header, base64Data] = base64Full.split(',');
        const inferredMime =
          file.type ||
          header.match(/data:(.*?);/)?.[1] ||
          (lowerName.endsWith('.pdf')
            ? 'application/pdf'
            : lowerName.endsWith('.docx')
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'image/jpeg');

        if (inferredMime.startsWith('image/') && !/\.(pdf|docx)$/i.test(lowerName)) {
          setPreviewUrl(base64Full);
        }

        const res = await fetch('/api/prescription/ocr-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64Data,
            imageBase64: base64Data,
            mimeType: inferredMime,
            fileName: file.name,
            language,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Document recognition failed');
      }

      const extractedItems: PrescriptionItem[] = data.items ?? [];
      setItems(extractedItems);
      setRawText(data.extractedRawText || '');

      const effectiveCondition = data.detectedCondition?.trim() || patientCondition.trim() || '';
      if (data.detectedCondition?.trim()) {
        setPatientCondition(data.detectedCondition.trim());
      }
      const hasDetectedAge =
        data.detectedAge !== undefined &&
        Number.isFinite(Number(data.detectedAge)) &&
        Number(data.detectedAge) >= 0;
      const effectiveAge = hasDetectedAge
        ? Number(data.detectedAge)
        : patientAge.trim() !== '' && Number.isFinite(Number(patientAge)) && Number(patientAge) >= 0
          ? Number(patientAge)
          : 45;
      if (hasDetectedAge) {
        setPatientAge(String(data.detectedAge));
      }

      const hasDetectedWeight =
        data.detectedWeightKg !== undefined && Number(data.detectedWeightKg) > 0;
      const effectiveWeight = hasDetectedWeight
        ? Number(data.detectedWeightKg)
        : Number(patientWeightKg) > 0
          ? Number(patientWeightKg)
          : undefined;
      if (hasDetectedWeight) {
        setPatientWeightKg(String(data.detectedWeightKg));
      }

      if (extractedItems.length === 0) {
        setConfirmed(false);
        setError(
          data.extractedRawText
            ? 'Text was extracted from your document below, but no structured dosage lines were auto-detected. Edit the lines or add a medicine row on the right.'
            : 'No legible text or medicines were found in this file. Please upload a clearer document/photo or paste the prescription text below.'
        );
        return;
      }

      setConfirmed(true);
      await runVerification(extractedItems, effectiveCondition, effectiveAge, language, effectiveWeight);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to process document');
    } finally {
      setBusy(false);
    }
  };

  const handleParseText = async () => {
    if (!rawText.trim()) return;
    stopAudio();
    setError('');
    setBusy(true);
    setReport(null);
    setExplanation(null);
    setSaveState('idle');
    try {
      const res = await fetch('/api/prescription/ocr-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parsing failed');
      setItems(data.items ?? []);
      if (data.detectedCondition?.trim()) {
        setPatientCondition(data.detectedCondition.trim());
      }
      if (
        data.detectedAge !== undefined &&
        Number.isFinite(Number(data.detectedAge)) &&
        Number(data.detectedAge) >= 0
      ) {
        setPatientAge(String(data.detectedAge));
      }
      if (data.detectedWeightKg !== undefined && Number(data.detectedWeightKg) > 0) {
        setPatientWeightKg(String(data.detectedWeightKg));
      }
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse prescription lines');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (overrideLang?: LanguageCode) => {
    if (!items.length) return;
    const activeLang = overrideLang ?? language;
    const parsedAge = Number(patientAge);
    const ageNum =
      patientAge.trim() !== '' && Number.isFinite(parsedAge) && parsedAge >= 0
        ? parsedAge
        : 45;
    const weightNum = Number(patientWeightKg) > 0 ? Number(patientWeightKg) : undefined;

    stopAudio();
    setError('');
    setBusy(true);
    try {
      await runVerification(items, patientCondition, ageNum, activeLang, weightNum);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLanguageSwitch = (newLang: LanguageCode) => {
    onLanguageChange(newLang);
    if (report) {
      void handleVerify(newLang);
    }
  };

  const playVoiceExplanation = async () => {
    if (!explanation) return;
    if (isPlaying) {
      stopAudio();
      return;
    }

    const script = [explanation.spokenScript, explanation.translatedPrescriptionText]
      .filter(Boolean)
      .join('. ');

    setVoiceBusy(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, language }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => setIsPlaying(false);
          audio.onerror = () => setIsPlaying(false);
          setIsPlaying(true);
          await audio.play();
          setVoiceBusy(false);
          return;
        }
      }
    } catch {
      // Fallback to browser SpeechSynthesis below
    }
    setVoiceBusy(false);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(script);
      const targetPrefix = language === 'ta' ? 'ta' : language === 'hi' ? 'hi' : 'en';
      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix));
      if (matched) utter.voice = matched;
      utter.lang = matched?.lang ?? (language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN');
      utter.onend = () => setIsPlaying(false);
      utter.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      window.speechSynthesis.speak(utter);
    }
  };

  const updateItem = (idx: number, patch: Partial<PrescriptionItem>) => {
    const nextItems = items.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row, ...patch };
      next.totalDailyMg =
        Math.round(next.strengthMg * Math.max(0, next.frequencyPerDay) * 100) / 100;
      return next;
    });
    setItems(nextItems);
    setConfirmed(false);

    const evalResult = evaluatePrescribedDosageAgainstGuidelines(
      nextItems,
      Number(patientAge) || 45,
      language
    );
    if (report && evalResult.status === 'Caution') {
      const updatedReport: VerificationReport = {
        ...report,
        overallVerdict:
          report.overallVerdict === 'SAFE_TO_TAKE'
            ? 'CAUTION_REVIEW'
            : report.overallVerdict,
        verdictHeadline: 'Caution — Dosage or Frequency Outside Guidelines',
        verdictQualifier: evalResult.localExplanation,
      };
      setReport(updatedReport);
      onReportReady(updatedReport);
      void triggerLocalExplanation(nextItems, updatedReport, language);
    }
  };

  const addBlankRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `rx-${Date.now()}`,
        brandName: 'Paracetamol',
        activeIngredients: ['paracetamol'],
        strengthMg: 500,
        frequencyPerDay: 2,
        totalDailyMg: 1000,
        durationDays: 3,
        route: 'Oral after food',
        batchNumber: '',
        manufacturer: '',
        rawLine: 'Tab Paracetamol 500 mg BD x 3 days',
      },
    ]);
    setConfirmed(false);
  };

  return (
    <div className="space-y-6">
      {/* Scan Here Header Bar */}
      <div className="organelle-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono text-[#556B22] font-semibold">
            SCAN HERE · PRESCRIPTION VERIFIER
          </span>
          <h2 className="font-display text-lg font-semibold text-[#1E221D]">
            {language === 'ta'
              ? 'மருந்துச்சீட்டைப் பதிவேற்றி சரிபார்க்கவும்'
              : language === 'hi'
                ? 'प्रिस्क्रिप्शन अपलोड करें और जाँचें'
                : 'Scan or Enter Prescription Details'}
          </h2>
          <p className="text-xs text-[#555A50]">
            Upload a prescription photo or medicine strip, review extracted lines, and verify dosage and disease match.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenTestCases && (
            <button
              type="button"
              onClick={onOpenTestCases}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <span>Browse Test Cases</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#BA5D33]" />
            </button>
          )}
          <div className="flex items-center gap-1.5 bg-[#EFE7DA] border border-[#D5C8B4] rounded-lg p-1">
            <Languages className="w-3.5 h-3.5 text-[#556B22] ml-1.5" />
            {(['en', 'ta', 'hi'] as LanguageCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => handleLanguageSwitch(code)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  language === code
                    ? 'bg-[#556B22] text-[#FCF9F4] font-semibold'
                    : 'text-[#4F544C] hover:text-[#1E221D]'
                }`}
              >
                {code === 'en' ? 'English' : code === 'ta' ? 'தமிழ்' : 'हिन्दी'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upload + Patient Context Split */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5 items-stretch">
        {/* Left: Photo Upload & Raw Text */}
        <div className="organelle-panel rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#1E221D]">{t.uploadTitle}</h3>
              <p className="text-xs text-[#555A50] mt-1">{t.uploadHint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.docx,.txt,.csv,.md,.json,.rtf,.html,.htm,.xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleImageUpload(f);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                {busy ? 'Extracting Document...' : 'Upload Photo or Document (PDF / DOCX / TXT)'}
              </button>
            </div>

            {previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-[#D5C8B4] bg-[#EFE7DA] max-h-48 flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Uploaded prescription preview"
                  referrerPolicy="no-referrer"
                  className="max-h-48 object-contain"
                />
              </div>
            ) : (
              uploadedDocName && (
                <div className="rounded-lg border border-[#D5C8B4] bg-[#EFE7DA] px-3 py-2 text-xs font-mono text-[#1E221D] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#556B22] shrink-0" />
                  <span className="truncate">Document loaded: {uploadedDocName}</span>
                </div>
              )
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#3C4138]">
                Prescription Text (editable)
              </label>
              <textarea
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Tab Metformin 500 mg — 1-0-1 PC x 30 days"
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2.5 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#556B22]"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-[#3C4138] mb-1">
                  {t.conditionLabel}
                </label>
                <input
                  type="text"
                  value={patientCondition}
                  onChange={(e) => setPatientCondition(e.target.value)}
                  placeholder="e.g., Fever, Diabetes"
                  className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3C4138] mb-1">
                  {t.ageLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  step="0.1"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3C4138] mb-1">
                  Weight (kg · Pediatric)
                </label>
                <input
                  type="number"
                  min={1}
                  max={250}
                  step="0.5"
                  value={patientWeightKg}
                  onChange={(e) => setPatientWeightKg(e.target.value)}
                  placeholder="e.g., 14"
                  className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4D9C7]">
            <button
              type="button"
              disabled={busy || !rawText.trim()}
              onClick={() => void handleParseText()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#EFE7DA] hover:bg-[#E5DAC7] text-[#1E221D] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#556B22]" />
              {t.extractBtn}
            </button>
          </div>
        </div>

        {/* Right: Structured Human-Confirmed Medicine Table */}
        <div className="organelle-panel rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#1E221D]">
                  Extracted Medicines ({items.length})
                </h3>
                <p className="text-xs text-[#555A50]">
                  Review or edit strength, daily doses, and batch number before running clinical verification.
                </p>
              </div>
              <button
                type="button"
                onClick={addBlankRow}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#C6B69E] bg-[#EFE7DA] text-xs font-medium text-[#1E221D] hover:bg-[#E5DAC7] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Drug
              </button>
            </div>

            <div className="overflow-x-auto border border-[#D5C8B4] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#EFE7DA] text-[#4F544C] font-mono">
                  <tr>
                    <th className="px-3 py-2">Brand / Ingredient</th>
                    <th className="px-2.5 py-2">Strength (mg)</th>
                    <th className="px-2.5 py-2">Doses/Day</th>
                    <th className="px-2.5 py-2">Daily mg</th>
                    <th className="px-2.5 py-2">Batch #</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4D9C7] bg-[#FCF9F4]">
                  {items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 space-y-1 min-w-[170px]">
                        <input
                          value={item.brandName}
                          onChange={(e) => updateItem(idx, { brandName: e.target.value })}
                          className="w-full bg-[#FCF9F4] border border-[#C6B69E] rounded px-2 py-1 text-[#1E221D] font-medium text-xs focus:outline-none focus:border-[#556B22]"
                        />
                        <input
                          value={item.activeIngredients.join(', ')}
                          onChange={(e) =>
                            updateItem(idx, {
                              activeIngredients: e.target.value
                                .split(',')
                                .map((s) => s.trim().toLowerCase())
                                .filter(Boolean),
                            })
                          }
                          placeholder="active ingredient(s)"
                          className="w-full bg-[#F5EFE5] border border-[#D5C8B4] rounded px-2 py-0.5 text-[#29659B] font-mono text-[11px] focus:outline-none focus:border-[#29659B]"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          type="number"
                          min={0}
                          value={item.strengthMg}
                          onChange={(e) =>
                            updateItem(idx, { strengthMg: Number(e.target.value) || 0 })
                          }
                          className="w-20 bg-[#FCF9F4] border border-[#C6B69E] rounded px-2 py-1 font-mono text-[#1E221D]"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={item.frequencyPerDay}
                          onChange={(e) =>
                            updateItem(idx, { frequencyPerDay: Number(e.target.value) || 1 })
                          }
                          className="w-16 bg-[#FCF9F4] border border-[#C6B69E] rounded px-2 py-1 font-mono text-[#1E221D]"
                        />
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[#1E221D] font-medium whitespace-nowrap">
                        {item.totalDailyMg} mg
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          value={item.batchNumber}
                          onChange={(e) => updateItem(idx, { batchNumber: e.target.value })}
                          placeholder="Batch"
                          className="w-24 bg-[#FCF9F4] border border-[#C6B69E] rounded px-2 py-1 font-mono text-[#1E221D]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-[#6C6F66] hover:text-[#B4233C]"
                          title="Remove medicine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[#555A50]">
                        No medicines extracted yet. Upload a photo, paste prescription text, or click a sample scenario.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-[#E4D9C7]">
            <DosageWarning exceedances={dosageExceedances} language={language} />

            {items.length > 0 && (
              <div
                className={`rounded-lg px-3.5 py-2.5 border text-xs flex items-start gap-2.5 ${
                  dosageEvaluation.status === 'Caution'
                    ? 'bg-[#FDF5E3] border-[#E4C98C] text-[#6B4A08]'
                    : 'bg-[#EAF5E9] border-[#B4D9B1] text-[#245920]'
                }`}
              >
                {dosageEvaluation.status === 'Caution' ? (
                  <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#3E7A3A] shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-mono font-semibold">
                    Guideline Check: {dosageEvaluation.status}
                  </div>
                  <p className="leading-relaxed">{dosageEvaluation.localExplanation}</p>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2.5 text-xs text-[#3C4138] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#556B22]"
              />
              <span>{t.confirmText}</span>
            </label>

            {error && (
              <div role="alert" className="text-xs text-[#8B152A] bg-[#FCEBEF] border border-[#E2A9B3] rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={busy || !confirmed || items.length === 0}
              onClick={() => void handleVerify()}
              className="w-full py-2.5 px-4 rounded-lg bg-[#3E7A3A] hover:bg-[#2F612B] text-[#FCF9F4] font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {busy ? 'Auditing Rules & Generating Explanation...' : t.verifyBtn}
            </button>
          </div>
        </div>
      </div>

      {/* Verification Output & Multilingual AlphaFold Explanation */}
      {report && (
        <div className="space-y-5">
          {/* Overall Safety Verdict Banner */}
          <div
            className={`rounded-xl p-5 border flex flex-wrap items-center justify-between gap-4 ${
              report.overallVerdict === 'SAFE_TO_TAKE'
                ? 'bg-[#EAF5E9] border-[#B4D9B1]'
                : report.overallVerdict === 'CAUTION_REVIEW'
                  ? 'bg-[#FDF5E3] border-[#E4C98C]'
                  : 'bg-[#FCEBEF] border-[#E2A9B3]'
            }`}
          >
            <div className="flex items-start gap-3.5 max-w-3xl">
              {report.overallVerdict === 'SAFE_TO_TAKE' ? (
                <ShieldCheck className="w-7 h-7 text-[#245920] shrink-0 mt-0.5" />
              ) : report.overallVerdict === 'CAUTION_REVIEW' ? (
                <AlertTriangle className="w-7 h-7 text-[#875E0D] shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-7 h-7 text-[#8B152A] shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span
                    className={`font-semibold ${
                      report.overallVerdict === 'SAFE_TO_TAKE'
                        ? 'text-[#245920]'
                        : report.overallVerdict === 'CAUTION_REVIEW'
                          ? 'text-[#875E0D]'
                          : 'text-[#8B152A]'
                    }`}
                  >
                    {report.overallVerdict === 'SAFE_TO_TAKE'
                      ? 'VERDICT: SAFE WITHIN VERIFIED RULES'
                      : report.overallVerdict === 'CAUTION_REVIEW'
                        ? 'VERDICT: REVIEW RECOMMENDED'
                        : 'VERDICT: ACTION REQUIRED'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#4F544C]">Dataset as of {report.asOfDate}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#4F544C]">Condition: {report.patientCondition}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-[#1E221D]">{report.verdictHeadline}</h3>
                <p className="text-sm text-[#2B3028] leading-relaxed">{report.verdictQualifier}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {userId && (
                <button
                  type="button"
                  disabled={saveState !== 'idle'}
                  onClick={() => void handleSaveToAccount()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FCF9F4] border border-[#C6B69E] text-[#1E221D] text-xs font-semibold hover:bg-[#EFE7DA] transition-colors whitespace-nowrap disabled:opacity-70"
                >
                  <BookmarkCheck className="w-4 h-4 text-[#556B22]" />
                  {saveState === 'saving'
                    ? 'Saving...'
                    : saveState === 'saved'
                      ? 'Saved to Account'
                      : 'Save Check'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenMechanism(report.primaryMechanismId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] text-xs font-semibold hover:bg-[#DCEAF7] transition-colors whitespace-nowrap"
              >
                <Microscope className="w-4 h-4" />
                {t.whyBtn} ({report.primaryMechanismId})
              </button>
              <button
                type="button"
                onClick={onOpenCellView}
                className="px-3.5 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] text-[#1E221D] text-xs font-semibold hover:bg-[#EFE7DA] transition-colors whitespace-nowrap"
              >
                {t.cellBtn}
              </button>
            </div>
          </div>

          {/* Validated Sources Grounding Final Safe / Unsafe Verdict */}
          {report.validationSources && report.validationSources.length > 0 && (
            <section
              aria-label="Sources Grounding Final Validation Result"
              className="organelle-panel rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-mono text-[#29659B] font-semibold">
                    VERIFIED EVIDENCE SOURCES · SAFE / UNSAFE VALIDATION
                  </span>
                  <h4 className="font-display text-base font-semibold text-[#1E221D]">
                    Authoritative Sources Cited for This Final Result ({report.validationSources.length})
                  </h4>
                </div>
                <span className="text-xs font-mono text-[#555A50]">
                  Verdict:{' '}
                  <strong
                    className={
                      report.overallVerdict === 'SAFE_TO_TAKE'
                        ? 'text-[#245920]'
                        : report.overallVerdict === 'CAUTION_REVIEW'
                          ? 'text-[#875E0D]'
                          : 'text-[#8B152A]'
                    }
                  >
                    {report.overallVerdict === 'SAFE_TO_TAKE' ? 'SAFE' : 'UNSAFE / REVIEW REQUIRED'}
                  </strong>
                </span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {report.validationSources.map((src) => (
                  <a
                    key={src.id}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="organelle-subpanel rounded-lg p-3 hover:border-[#29659B] transition-colors flex flex-col justify-between gap-1.5 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] font-semibold text-[#556B22]">
                        {src.category.toUpperCase()}
                      </div>
                      <div className="font-semibold text-[#1E221D] leading-snug">{src.title}</div>
                      <p className="text-[#4F544C] leading-snug">{src.relevance}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[#29659B] pt-1">
                      <span className="truncate">{src.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Multilingual Translated Explanation + Voice + Doctor Questions */}
          {explanation && (
            <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5">
              <div className="organelle-panel rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono text-[#29659B] font-semibold">
                      TRANSLATED INSTRUCTIONS
                    </span>
                    <h4 className="font-display text-lg font-semibold text-[#1E221D]">{t.translatedTitle}</h4>
                  </div>

                  <button
                    type="button"
                    disabled={voiceBusy}
                    onClick={() => void playVoiceExplanation()}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      isPlaying
                        ? 'bg-[#B4233C] text-[#FCF9F4] hover:bg-[#961B30]'
                        : 'bg-[#29659B] text-[#FCF9F4] hover:bg-[#1F507D]'
                    }`}
                  >
                    {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-4 h-4" />}
                    {voiceBusy ? 'Synthesizing...' : isPlaying ? t.stopVoice : t.voiceBtn}
                  </button>
                </div>

                <pre className="whitespace-pre-wrap font-sans text-sm text-[#1E221D] bg-[#EFE7DA] border border-[#D5C8B4] rounded-lg p-3.5 leading-relaxed">
                  {explanation.translatedPrescriptionText}
                </pre>

                <div className="space-y-2">
                  <p className="text-sm text-[#2B3028] leading-relaxed">
                    {explanation.summaryExplanation}
                  </p>
                  <div className="bg-[#F2ECF8] border border-[#D4C3E8] rounded-lg p-3.5 text-sm text-[#3E2759] leading-relaxed">
                    {explanation.cellularAlphaFoldNote}
                  </div>
                </div>
              </div>

              <div className="organelle-panel rounded-xl p-5 space-y-3">
                <div className="text-xs font-mono text-[#3E7A3A] font-semibold">PATIENT ADVOCACY</div>
                <h4 className="font-display text-lg font-semibold text-[#1E221D]">{t.questionsTitle}</h4>
                <ul className="space-y-2.5">
                  {explanation.doctorQuestions.map((q, idx) => (
                    <li
                      key={idx}
                      className="organelle-subpanel rounded-lg p-3 text-sm text-[#1E221D] flex items-start gap-2.5"
                    >
                      <span className="font-mono text-xs text-[#556B22] font-semibold mt-0.5">0{idx + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Backend RAG Validation Output (Age, Weight, Condition & Formulary Safety) */}
          {((report.ragMatches && report.ragMatches.length > 0) ||
            (scanRagEvaluation && scanRagEvaluation.flaggedCount > 0)) && (
            <div className="organelle-panel rounded-xl p-5 space-y-4 border-[#DEC595]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-mono text-[#875E0D] font-semibold">
                    BACKEND RAG VALIDATION OUTPUT (CDSCO · IAP · WHO)
                  </span>
                  <h4 className="font-display text-lg font-semibold text-[#1E221D]">
                    Medication Safety & Dosage RAG Findings
                  </h4>
                </div>
                <span className="text-xs font-mono text-[#555A50]">
                  Age {report.patientAge} yrs
                  {report.patientWeightKg ? ` · ${report.patientWeightKg} kg` : ''}
                  {report.patientCondition ? ` · ${report.patientCondition}` : ''}
                </span>
              </div>

              {scanRagEvaluation && scanRagEvaluation.flaggedCount > 0 && (
                <div
                  role="alert"
                  aria-label="Condition and Age Dosage Safety Alert"
                  className="rounded-xl p-4 bg-[#FDF5E3] border border-[#E4C98C] space-y-2.5 text-xs text-[#6B4A08]"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0" />
                    <span>
                      Age & Condition RAG Audit ({scanRagEvaluation.patientGroup} ·{' '}
                      {scanRagEvaluation.patientAgeYears} yrs)
                    </span>
                  </div>
                  <div className="grid lg:grid-cols-2 gap-2.5">
                    {scanRagEvaluation.flags
                      .filter((f) => f.isPotentiallyUnsafe)
                      .map((f) => (
                        <div
                          key={f.itemId}
                          className="rounded-lg bg-[#FCF9F4] border border-[#E4C98C] px-3 py-2.5 space-y-1 text-[#1E221D]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">
                              {f.brandName} ({f.medicineName})
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-[#8B152A]">
                              {f.safetyLevel}
                            </span>
                          </div>
                          <ul className="space-y-0.5 text-[#3C4138]">
                            {f.reasons.map((r, rIdx) => (
                              <li key={rIdx}>• {r}</li>
                            ))}
                          </ul>
                          <div className="font-mono text-[11px] text-[#555A50]">
                            Ref: {f.referenceDose} · {f.source}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {report.ragMatches && report.ragMatches.length > 0 && (
                <div className="grid lg:grid-cols-2 gap-4">
                  {report.ragMatches.map((match) => {
                    const activeRec = match.triggeredUnsafeRecord ?? match.matchedRecord;
                    const isStop =
                      activeRec.safety_status === 'CONTRAINDICATED' ||
                      activeRec.action === 'CONTRAINDICATED_STOP';
                    return (
                      <div
                        key={match.itemId}
                        className={`rounded-xl p-4 border space-y-3 text-xs ${
                          isStop
                            ? 'bg-[#FCEBEF] border-[#E2A9B3]'
                            : 'bg-[#FDF5E3] border-[#E4C98C]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div
                              className={`flex items-center gap-2 font-mono font-bold ${
                                isStop ? 'text-[#8B152A]' : 'text-[#875E0D]'
                              }`}
                            >
                              <AlertTriangle
                                className={`w-4 h-4 shrink-0 ${
                                  isStop ? 'text-[#B4233C]' : 'text-[#B8841E]'
                                }`}
                              />
                              <span>{match.warningBannerTitle}</span>
                            </div>
                            <div className="text-sm font-semibold text-[#1E221D]">
                              {match.matchedRecord.medicine_name} ({match.brandName})
                            </div>
                            <div className="text-[11px] text-[#4F544C]">
                              Brands: {activeRec.brand_examples.join(', ')} · Evidence: {activeRec.evidence_level} · {activeRec.safety_status}
                            </div>
                          </div>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[#1E221D]">
                            {isStop ? 'Pediatric Contraindication' : 'Verify Weight & Dose'}
                          </span>
                        </div>

                        <p className="text-[#2B3028] leading-relaxed">{match.warningSummary}</p>

                        <div className="grid sm:grid-cols-2 gap-2 bg-[#FCF9F4] border border-[#D5C8B4] rounded-lg p-2.5">
                          <div>
                            <div className="text-[11px] font-mono text-[#555A50]">Reference Dose & Age</div>
                            <div className="text-[#1E221D] font-medium mt-0.5">
                              {match.matchedRecord.reference_dose} ({match.matchedRecord.age_range})
                            </div>
                            <div className="text-[11px] text-[#4F544C] mt-0.5">
                              Route: {match.matchedRecord.route} · {match.matchedRecord.frequency}
                            </div>
                            {match.calculatedWeightDoseRange && (
                              <div className="text-[#29659B] font-mono font-semibold text-[11px] mt-1">
                                Calc: {match.calculatedWeightDoseRange}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-[11px] font-mono text-[#555A50]">Weight Guidance & Maximum</div>
                            <div className="text-[#2B3028] mt-0.5">{match.matchedRecord.weight_guidance}</div>
                            <div className="text-[11px] text-[#555A50] mt-0.5">{match.matchedRecord.maximum}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                          <span className="px-2 py-0.5 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[#1E221D]">
                            Weight Check: {activeRec.requires_weight_check ? 'Required' : 'Age-Banded'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[#1E221D]">
                            Formulation Check: {activeRec.requires_formulation_check ? 'Required' : 'Standard'}
                          </span>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <div className="rounded-lg bg-[#FCF9F4] border border-[#D5C8B4] p-2 space-y-0.5">
                            <div className="text-[10px] font-mono text-[#8B152A] font-semibold">
                              CONTRAINDICATIONS
                            </div>
                            <div className="text-[#3C4138]">
                              {activeRec.contraindications.join(' · ')}
                            </div>
                          </div>
                          <div className="rounded-lg bg-[#FCF9F4] border border-[#D5C8B4] p-2 space-y-0.5">
                            <div className="text-[10px] font-mono text-[#875E0D] font-semibold">
                              INTERACTIONS
                            </div>
                            <div className="text-[#3C4138]">
                              {activeRec.interactions.join(' · ')}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-[#875E0D] font-semibold">
                            Recommended Action:
                          </div>
                          <ul className="space-y-1 text-[#2B3028]">
                            {activeRec.recommended_action.map((step, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="font-mono text-[#556B22] font-bold">•</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D5C8B4]">
                          <a
                            href={activeRec.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#29659B] hover:underline"
                          >
                            <span>Reference: {activeRec.source}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => onOpenMechanism(match.matchedRecord.mechanism_target_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] hover:bg-[#DCEAF7] font-medium"
                          >
                            <Microscope className="w-3.5 h-3.5" />
                            3D {match.matchedRecord.mechanism_target_id}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Auditable Criterion-by-Criterion Breakdown */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Dosage & Disease Audits */}
            <div className="organelle-panel rounded-xl p-5 space-y-4">
              <div>
                <span className="text-xs font-mono text-[#29659B] font-semibold">CURATED EVIDENCE TIER</span>
                <h4 className="font-display text-lg font-semibold text-[#1E221D]">
                  Dosage & Disease Match Audit
                </h4>
              </div>

              <div className="space-y-3">
                {report.dosageAudits.map((d) => {
                  const disease = report.diseaseAudits.find((m) => m.itemId === d.itemId);
                  const doseOk = d.status === 'Appropriate';
                  const disOk = disease?.status === 'Matches Condition';
                  return (
                    <div
                      key={d.itemId}
                      className="organelle-subpanel rounded-lg p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#1E221D]">{d.brandName}</span>
                        <span className="font-mono text-[#4F544C]">
                          {d.prescribedDailyMg} mg/day · {d.ingredient}
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        {doseOk ? (
                          <CheckCircle2 className="w-4 h-4 text-[#3E7A3A] shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-semibold text-[#1E221D]">Dosage — {d.status}: </span>
                          <span className="text-[#3C4138]">{d.criterionNote}</span>
                          <div className="text-[11px] font-mono text-[#555A50] mt-0.5">
                            Source: {d.source}
                          </div>
                        </div>
                      </div>

                      {disease && (
                        <div className="flex items-start gap-2 pt-1.5 border-t border-[#DCD0BD]">
                          {disOk ? (
                            <CheckCircle2 className="w-4 h-4 text-[#3E7A3A] shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-semibold text-[#1E221D]">
                              Disease Match — {disease.status}:{' '}
                            </span>
                            <span className="text-[#3C4138]">{disease.criterionNote}</span>
                            <div className="text-[11px] font-mono text-[#555A50] mt-0.5">
                              Source: {disease.source}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pack Check & Regimen Findings */}
            <div className="organelle-panel rounded-xl p-5 space-y-4">
              <div>
                <span className="text-xs font-mono text-[#3E7A3A] font-semibold">
                  VERIFIED & CURATED EVIDENCE TIERS
                </span>
                <h4 className="font-display text-lg font-semibold text-[#1E221D]">
                  Pack Check (Batch Alerts) & Regimen Interactions
                </h4>
              </div>

              <div className="space-y-3">
                {report.packChecks.map((p) => (
                  <div
                    key={p.itemId}
                    className="organelle-subpanel rounded-lg p-3.5 space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#1E221D]">{p.productName}</span>
                      <span
                        className={`font-mono font-semibold ${
                          p.tier === 'Confirmed'
                            ? 'text-[#8B152A]'
                            : p.tier === 'Same product, different batch'
                              ? 'text-[#875E0D]'
                              : 'text-[#3C4138]'
                        }`}
                      >
                        {p.tier === 'Not found'
                          ? `Not found in alerts as of ${p.asOfDate}`
                          : `${p.tier} (${p.agency} ${p.alertId})`}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#555A50]">
                      Evidence: {p.evidenceTier} · Batch: {p.batchNumber} · Product match:{' '}
                      {p.criteria.productMatch ? 'Yes' : 'No'} · Batch match:{' '}
                      {p.criteria.batchMatch ? 'Yes' : 'No'}
                    </div>
                    {p.reason && <p className="text-[#8B152A] font-medium">{p.reason}</p>}
                  </div>
                ))}

                {report.regimenFindings.length === 0 ? (
                  <div className="bg-[#EAF5E9] border border-[#B4D9B1] rounded-lg p-3.5 text-xs text-[#245920] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Regimen Check: No drug-drug interactions, duplicate ingredients, elderly Beers alerts, or banned FDC combinations detected in loaded rules as of {report.asOfDate}.
                    </span>
                  </div>
                ) : (
                  report.regimenFindings.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg p-3.5 bg-[#FCEBEF] border border-[#E2A9B3] space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#8B152A]">{f.title}</span>
                        <span className="font-mono text-[#8B152A]">
                          {f.evidenceTier} · {f.category}
                        </span>
                      </div>
                      <p className="text-[#2B3028] leading-relaxed">{f.clinicalSummary}</p>
                      <div className="text-[11px] font-mono text-[#555A50]">
                        Criterion: {f.criterionMatch} · Source: {f.source}
                      </div>
                      {f.mechanismTargetId && (
                        <button
                          type="button"
                          onClick={() => onOpenMechanism(f.mechanismTargetId!)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] hover:bg-[#DCEAF7] font-semibold transition-colors"
                        >
                          <Microscope className="w-3.5 h-3.5" />
                          {t.whyBtn} ({f.mechanismTargetId})
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
