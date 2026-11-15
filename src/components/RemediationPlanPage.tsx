import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  ListChecks,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Square,
  Stethoscope,
  Volume2,
} from 'lucide-react';
import type {
  ConditionAgeDosageEvaluation,
  LanguageCode,
  PrescriptionItem,
  RemediationPlan,
  RemediationPriority,
  SafetyMeasureItem,
  VerificationReport,
} from '../types/medguard.ts';

interface RemediationPlanPageProps {
  language: LanguageCode;
  report: VerificationReport | null;
  items: PrescriptionItem[];
  ragEvaluation: ConditionAgeDosageEvaluation | null;
  cachedPlan: RemediationPlan | null;
  onPlanGenerated: (plan: RemediationPlan) => void;
  onBackToScan: () => void;
  onOpenTestCases: () => void;
}

const LABELS: Record<
  LanguageCode,
  {
    kicker: string;
    pageTitle: string;
    backToScan: string;
    listenBtn: string;
    stopBtn: string;
    refreshBtn: string;
    todoSectionKicker: string;
    todoSectionTitle: string;
    safetySectionKicker: string;
    safetySectionTitle: string;
    sourcesSectionKicker: string;
    sourcesSectionTitle: string;
    sourcesNote: string;
    emptyTitle: string;
    emptyDesc: string;
    goToScan: string;
    goToCases: string;
  }
> = {
  en: {
    kicker: 'CLINICAL REMEDIATION & NEXT ACTIONS',
    pageTitle: 'To-Do Next Plan & Safety Measures',
    backToScan: 'Back to Scan Results',
    listenBtn: 'Listen to Plan',
    stopBtn: 'Stop Voice',
    refreshBtn: 'Regenerate Plan',
    todoSectionKicker: 'STEP-BY-STEP ACTION CHECKLIST',
    todoSectionTitle: 'To-Do Remediation Steps',
    safetySectionKicker: 'MONITORING, LABS & PRECAUTIONS',
    safetySectionTitle: 'Next Safety Measures to Undergo',
    sourcesSectionKicker: 'AUTHORITATIVE CLINICAL REFERENCES',
    sourcesSectionTitle: 'Verified Resources & Guidelines Supporting This Plan',
    sourcesNote:
      'All clinical guidelines, drug labels, and grounded medical references consulted for this remediation plan are listed below.',
    emptyTitle: 'No Scanned Prescription Loaded Yet',
    emptyDesc:
      'Run a verification in Scan Here or load a scenario from Test Cases first. Once your dosage and disease match audit finishes, click "To-Do Next Plan" to view your tailored action steps here.',
    goToScan: 'Open Scan Here',
    goToCases: 'Browse Test Cases',
  },
  ta: {
    kicker: 'அடுத்த செயல் & பாதுகாப்புத் திட்டம்',
    pageTitle: 'To-Do செயல் திட்டம் மற்றும் பாதுகாப்பு நடவடிக்கைகள்',
    backToScan: 'ஸ்கேன் முடிவுகளுக்குத் திரும்பு',
    listenBtn: 'திட்டத்தைக் கேளுங்கள்',
    stopBtn: 'ஒலியை நிறுத்து',
    refreshBtn: 'புதுப்பி',
    todoSectionKicker: 'படிப்படியான செயல் பட்டியல்',
    todoSectionTitle: 'செய்ய வேண்டிய அடுத்த படிகள் (To-Do)',
    safetySectionKicker: 'பரிசோதனைகள் & கண்காணிப்பு',
    safetySectionTitle: 'அடுத்ததாக மேற்கொள்ள வேண்டிய பாதுகாப்பு நடவடிக்கைகள்',
    sourcesSectionKicker: 'நம்பகமான மருத்துவ ஆதாரங்கள்',
    sourcesSectionTitle: 'இந்தத் திட்டத்திற்கான சிறந்த மருத்துவ வழிகாட்டுதல் ஆதாரங்கள்',
    sourcesNote:
      'இந்த செயல் திட்டம் மற்றும் பாதுகாப்பு நடவடிக்கைகளுக்குப் பயன்படுத்தப்பட்ட அதிகாரப்பூர்வ மருத்துவ ஆதாரங்கள் கீழே கொடுக்கப்பட்டுள்ளன.',
    emptyTitle: 'இன்னும் எந்த மருந்துச்சீட்டும் சரிபார்க்கப்படவில்லை',
    emptyDesc:
      'முதலில் "Scan Here" அல்லது "Test Cases"-இல் மருந்துச்சீட்டைச் சரிபார்க்கவும். அதன் பிறகு உங்கள் To-Do செயல் திட்டம் இங்கே உருவாகும்.',
    goToScan: 'Scan Here திற',
    goToCases: 'Test Cases பார்',
  },
  hi: {
    kicker: 'अगली कार्य योजना और सुरक्षा उपाय',
    pageTitle: 'To-Do सुधार योजना और सुरक्षा उपाय',
    backToScan: 'स्कैन परिणाम पर वापस जाएं',
    listenBtn: 'योजना सुनें',
    stopBtn: 'आवाज़ रोकें',
    refreshBtn: 'पुनः बनाएं',
    todoSectionKicker: 'चरणबद्ध कार्य सूची',
    todoSectionTitle: 'करने योग्य अगले कदम (To-Do)',
    safetySectionKicker: 'जांच, लैब और सावधानियां',
    safetySectionTitle: 'अपनाए जाने वाले अगले सुरक्षा उपाय',
    sourcesSectionKicker: 'प्रामाणिक चिकित्सा स्रोत',
    sourcesSectionTitle: 'इस योजना के लिए उपयोग किए गए प्रमुख चिकित्सा संसाधन और दिशानिर्देश',
    sourcesNote:
      'इस सुधार योजना और सुरक्षा उपायों के लिए संदर्भित सभी चिकित्सा दिशानिर्देश और आधिकारिक स्रोत नीचे सूचीबद्ध हैं।',
    emptyTitle: 'अभी कोई स्कैन किया गया प्रिस्क्रिप्शन नहीं है',
    emptyDesc:
      'पहले "Scan Here" या "Test Cases" में प्रिस्क्रिप्शन की जाँच करें। उसके बाद आपकी To-Do योजना यहाँ दिखाई देगी।',
    goToScan: 'Scan Here खोलें',
    goToCases: 'Test Cases देखें',
  },
};

function priorityTextColor(priority: RemediationPriority): string {
  switch (priority) {
    case 'Immediate':
      return 'text-[#8B152A]';
    case 'Before Next Dose':
      return 'text-[#875E0D]';
    case 'Ongoing Safety':
      return 'text-[#245920]';
    default:
      return 'text-[#29659B]';
  }
}

function safetyCategoryColor(category: SafetyMeasureItem['category']): string {
  switch (category) {
    case 'Emergency Red Flag':
      return 'text-[#8B152A]';
    case 'Clinical Lab / Test':
      return 'text-[#29659B]';
    case 'Vital & Symptom Watch':
      return 'text-[#875E0D]';
    default:
      return 'text-[#556B22]';
  }
}

export function RemediationPlanPage({
  language,
  report,
  items,
  ragEvaluation,
  cachedPlan,
  onPlanGenerated,
  onBackToScan,
  onOpenTestCases,
}: RemediationPlanPageProps) {
  const t = LABELS[language];
  const [plan, setPlan] = useState<RemediationPlan | null>(cachedPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completedIds, setCompletedIds] = useState<Record<string, boolean>>({});
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchPlan = useCallback(
    async (force = false) => {
      if (!report) return;
      if (
        !force &&
        cachedPlan &&
        cachedPlan.language === language &&
        cachedPlan.patientCondition === report.patientCondition &&
        cachedPlan.patientAge === report.patientAge
      ) {
        setPlan(cachedPlan);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/prescription/remediation-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            report,
            ragEvaluation,
            language,
          }),
        });
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || 'Could not generate remediation plan.');
        }
        const generated = (await res.json()) as RemediationPlan;
        setPlan(generated);
        setCompletedIds({});
        onPlanGenerated(generated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to generate remediation plan.');
      } finally {
        setLoading(false);
      }
    },
    [report, cachedPlan, language, items, ragEvaluation, onPlanGenerated]
  );

  useEffect(() => {
    void fetchPlan(false);
  }, [fetchPlan]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const completedCount = useMemo(() => {
    if (!plan) return 0;
    return plan.todoSteps.filter((s) => completedIds[s.id]).length;
  }, [plan, completedIds]);

  const toggleStep = (id: string) => {
    setCompletedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const playVoicePlan = async () => {
    if (!plan) return;
    if (isPlaying) {
      stopAudio();
      return;
    }
    const script = [
      plan.triggerSummary,
      ...plan.todoSteps.map((s) => `Step ${s.stepNumber}: ${s.title}. ${s.actionDetail}`),
      ...plan.safetyMeasures.map((m) => `Safety check: ${m.title}. ${m.whenToUndergo}.`),
    ].join(' ');

    setVoiceBusy(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, language }),
      });
      if (res.ok) {
        const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
        if (data.audioBase64) {
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
          );
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
      // fallback to browser speech synthesis below
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(script);
      const prefix = language === 'ta' ? 'ta' : language === 'hi' ? 'hi' : 'en';
      const preferred = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (preferred) utterance.voice = preferred;
      utterance.lang =
        preferred?.lang ??
        (language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN');
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    }
    setVoiceBusy(false);
  };

  if (!report) {
    return (
      <div className="organelle-panel rounded-xl p-8 text-center space-y-4 max-w-2xl mx-auto">
        <div className="w-11 h-11 rounded-xl bg-[#EFE7DA] border border-[#D5C8B4] flex items-center justify-center mx-auto text-[#556B22]">
          <ListChecks className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold text-[#1E221D]">{t.emptyTitle}</h2>
          <p className="text-sm text-[#4F544C] leading-relaxed">{t.emptyDesc}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onBackToScan}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <ScanLine className="w-3.5 h-3.5" />
            {t.goToScan}
          </button>
          <button
            type="button"
            onClick={onOpenTestCases}
            className="px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {t.goToCases}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header & Match Assessment */}
      <section className="organelle-panel rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#556B22] font-semibold">
              <span>{t.kicker}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#4F544C] font-normal">
                {report.patientCondition} · {report.patientAge} yrs
                {report.patientWeightKg ? ` · ${report.patientWeightKg} kg` : ''}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1E221D] tracking-tight text-balance">
              {t.pageTitle}
            </h1>
            {plan && (
              <p className="text-sm text-[#2B3028] leading-relaxed">{plan.triggerSummary}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBackToScan}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t.backToScan}
            </button>
            {plan && (
              <button
                type="button"
                disabled={voiceBusy}
                onClick={() => void playVoicePlan()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  isPlaying
                    ? 'bg-[#B4233C] text-[#FCF9F4] hover:bg-[#961B30]'
                    : 'bg-[#29659B] text-[#FCF9F4] hover:bg-[#1F507D]'
                }`}
              >
                {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {voiceBusy ? 'Synthesizing...' : isPlaying ? t.stopBtn : t.listenBtn}
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchPlan(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#637928] bg-[#EAF0DC] hover:bg-[#DEE8C8] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t.refreshBtn}
            </button>
          </div>
        </div>

        {/* Dosage Match, Disease Match & Health Quiz Audit Summary Strip */}
        {plan && (
          <div className="grid md:grid-cols-3 gap-3 pt-3 border-t border-[#E4D9C7]">
            <div className="organelle-subpanel rounded-lg p-3.5 flex items-start gap-2.5 text-xs">
              {report.overallVerdict === 'SAFE_TO_TAKE' ? (
                <ShieldCheck className="w-4 h-4 text-[#245920] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#875E0D] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-mono text-[11px] font-semibold text-[#555A50]">
                  DOSAGE AUDIT TRIGGER
                </div>
                <p className="text-[#1E221D] mt-0.5 leading-snug">
                  {plan.dosageMatchStatusSummary}
                </p>
              </div>
            </div>

            <div className="organelle-subpanel rounded-lg p-3.5 flex items-start gap-2.5 text-xs">
              {report.diseaseAudits.every((d) => d.status === 'Matches Condition') ? (
                <ShieldCheck className="w-4 h-4 text-[#245920] shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-[#8B152A] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-mono text-[11px] font-semibold text-[#555A50]">
                  MEDICINE-TO-DISEASE MATCH TRIGGER
                </div>
                <p className="text-[#1E221D] mt-0.5 leading-snug">
                  {plan.diseaseMatchStatusSummary}
                </p>
              </div>
            </div>

            <div className="organelle-subpanel rounded-lg p-3.5 flex items-start gap-2.5 text-xs">
              {(report.quizRiskFindings?.length ?? 0) > 0 ? (
                <ShieldAlert className="w-4 h-4 text-[#8B152A] shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#245920] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-mono text-[11px] font-semibold text-[#555A50]">
                  HEALTH QUIZ FATAL-RISK CHECK
                </div>
                <p className="text-[#1E221D] mt-0.5 leading-snug">
                  {plan.quizRiskStatusSummary ||
                    'Cross-checked against surgery, allergy, and organ safety profile.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl p-4 bg-[#FCEBEF] border border-[#E2A9B3] text-xs text-[#8B152A] flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchPlan(true)}
            className="px-3 py-1.5 rounded bg-[#B4233C] text-[#FCF9F4] font-semibold whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !plan && (
        <div className="organelle-panel rounded-xl p-8 text-center text-sm text-[#4F544C]">
          Synthesizing clinical remediation To-Do plan and safety checks from authoritative medical guidelines...
        </div>
      )}

      {plan && (
        <>
          {/* Section 1: Interactive To-Do Remediation Checklist */}
          <section className="organelle-panel rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-[#556B22] font-semibold">
                  {t.todoSectionKicker}
                </span>
                <h2 className="font-display text-xl font-bold text-[#1E221D]">
                  {t.todoSectionTitle}
                </h2>
              </div>
              <div className="text-xs font-mono tabular-nums text-[#4F544C]">
                {completedCount} / {plan.todoSteps.length} completed
              </div>
            </div>

            <div className="divide-y divide-[#E4D9C7] border border-[#D5C8B4] rounded-xl bg-[#FCF9F4]">
              {plan.todoSteps.map((step) => {
                const isDone = Boolean(completedIds[step.id]);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    className={`w-full text-left p-4 flex items-start gap-3.5 transition-colors hover:bg-[#F7F2E7] ${
                      isDone ? 'opacity-75' : ''
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? 'bg-[#556B22] border-[#556B22] text-[#FCF9F4]'
                          : 'bg-[#FCF9F4] border-[#B8A68B] text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="font-semibold text-[#555A50] tabular-nums">
                          {String(step.stepNumber).padStart(2, '0')}.
                        </span>
                        <span className={`font-semibold ${priorityTextColor(step.priority)}`}>
                          {step.priority}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#4F544C]">{step.timeframe}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#29659B]">{step.relatedMedicine}</span>
                      </div>

                      <div
                        className={`text-sm font-semibold ${
                          isDone ? 'line-through text-[#6C6F66]' : 'text-[#1E221D]'
                        }`}
                      >
                        {step.title}
                      </div>

                      <p className="text-xs text-[#3C4138] leading-relaxed">
                        {step.actionDetail}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Next Safety Measures to Undergo */}
          <section className="organelle-panel rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-[#29659B] font-semibold">
                  {t.safetySectionKicker}
                </span>
                <h2 className="font-display text-xl font-bold text-[#1E221D]">
                  {t.safetySectionTitle}
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#555A50]">
                {plan.safetyMeasures.length} measures
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {plan.safetyMeasures.map((measure) => (
                <div
                  key={measure.id}
                  className="organelle-subpanel rounded-xl p-4 space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span className={`font-semibold ${safetyCategoryColor(measure.category)}`}>
                        {measure.category}
                      </span>
                      <span className="text-[#555A50]">{measure.whenToUndergo}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-[#1E221D] flex items-start gap-2">
                      <Stethoscope className="w-4 h-4 text-[#29659B] shrink-0 mt-0.5" />
                      <span>{measure.title}</span>
                    </h3>

                    <p className="text-xs text-[#3C4138] leading-relaxed">{measure.rationale}</p>
                  </div>

                  {measure.clinicianQuestion && (
                    <div className="pt-2.5 border-t border-[#DCD0BD] text-xs text-[#2B3028]">
                      <span className="font-mono text-[11px] font-semibold text-[#556B22]">
                        ASK YOUR CLINICIAN:{' '}
                      </span>
                      <span>{measure.clinicianQuestion}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Section 3 (Strictly at the End of the To-Do Plan): Authoritative Sources */}
          <section
            aria-label="Best Clinical Sources at End of Remediation Plan"
            className="organelle-panel rounded-xl p-6 space-y-4"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono text-[#875E0D] font-semibold">
                  {t.sourcesSectionKicker}
                </span>
                <span className="text-xs font-mono tabular-nums text-[#555A50]">
                  {plan.sources.length} sources · {plan.generatedAt}
                </span>
              </div>
              <h2 className="font-display text-lg font-bold text-[#1E221D]">
                {t.sourcesSectionTitle}
              </h2>
              <p className="text-xs text-[#4F544C] leading-relaxed">{t.sourcesNote}</p>
            </div>

            <div className="divide-y divide-[#E4D9C7] border border-[#D5C8B4] rounded-xl bg-[#FCF9F4]">
              {plan.sources.map((src, idx) => (
                <a
                  key={src.id}
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#F7F2E7] transition-colors text-xs"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#555A50]">
                      <span className="tabular-nums font-semibold">
                        [{String(idx + 1).padStart(2, '0')}]
                      </span>
                      <span className="text-[#556B22] font-semibold">{src.publisher}</span>
                      <span aria-hidden="true">·</span>
                      <span>{src.sourceType}</span>
                    </div>
                    <div className="font-semibold text-[#1E221D]">{src.title}</div>
                    <p className="text-[#4F544C]">{src.scope}</p>
                  </div>

                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#29659B] shrink-0">
                    Open Source <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
