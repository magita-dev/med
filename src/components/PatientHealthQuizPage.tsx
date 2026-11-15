import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HeartPulse,
  Languages,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  DRUG_ALLERGY_OPTIONS,
  EMPTY_PATIENT_HEALTH_QUIZ,
  FATAL_RISK_FACTOR_OPTIONS,
  SURGICAL_STATUS_OPTIONS,
  hasActiveQuizRisks,
  summarizeQuizProfile,
} from '../data/healthQuizCatalog.ts';
import type {
  DrugAllergyId,
  FatalRiskFactorId,
  LanguageCode,
  PatientHealthQuiz,
  SurgicalHistoryStatus,
} from '../types/medguard.ts';

interface PatientHealthQuizPageProps {
  mode: 'gate' | 'page';
  language: LanguageCode;
  quizProfile: PatientHealthQuiz;
  onLanguageChange: (lang: LanguageCode) => void;
  onCompleteQuiz: (nextQuiz: PatientHealthQuiz, target: 'home' | 'scan') => void;
  onSkipToHome: () => void;
  onKeepSavedToHome?: () => void;
}

const QUIZ_COPY: Record<
  LanguageCode,
  {
    gateKicker: string;
    gateTitle: string;
    gateSubtitle: string;
    takeQuizBtn: string;
    skipQuizBtn: string;
    keepSavedBtn: string;
    updateQuizBtn: string;
    stepTitles: [string, string, string, string];
    stepSubtitles: [string, string, string, string];
    saveHomeBtn: string;
    saveScanBtn: string;
    backBtn: string;
    nextBtn: string;
  }
> = {
  en: {
    gateKicker: 'STEP 0 · PERSONALIZED FATAL-RISK INTAKE',
    gateTitle: 'Would you like to take a quick Health & Safety Quiz first?',
    gateSubtitle:
      'Before entering MedGuard, share any drug allergies, recent surgeries, or vital organ conditions. Every prescription you scan in Scan Here will be combined with this quiz to catch fatal conflicts automatically.',
    takeQuizBtn: 'Yes, Take Quick Safety Quiz (~45 sec)',
    skipQuizBtn: 'Skip for Now & Go to Home Page',
    keepSavedBtn: 'Use Saved Health Profile & Go to Home Page',
    updateQuizBtn: 'Update or Retake Safety Quiz',
    stepTitles: [
      'Drug Allergies & Severe Reactions',
      'Recent or Upcoming Surgery & Bleeding Risk',
      'Vital Organ & Fatal-End Risk Factors',
      'Age, Weight & Final Safety Lock-In',
    ],
    stepSubtitles: [
      'Select any medicine classes that have caused hives, throat swelling, breathing trouble, or severe reactions.',
      'NSAIDs, painkillers, and diabetes medicines can cause life-threatening hemorrhage or lactic acidosis around surgery.',
      'Select any existing medical risks so the scanner adjusts dosage ceilings and blocks fatal contraindications.',
      'Confirm optional baseline age/weight to auto-sync with Scan Here, review your risk triggers, and lock in your profile.',
    ],
    saveHomeBtn: 'Save Health Profile & Proceed to Home',
    saveScanBtn: 'Save Profile & Open Scanner',
    backBtn: 'Previous Step',
    nextBtn: 'Continue',
  },
  ta: {
    gateKicker: 'படி 0 · தனிப்பட்ட உயிராபத்து பாதுகாப்பு சரிபார்ப்பு',
    gateTitle: 'முதலில் ஒரு சிறிய உடல்நல பாதுகாப்பு வினாடி-வினாவை எடுக்க விரும்புகிறீர்களா?',
    gateSubtitle:
      'முகப்புப் பக்கத்திற்குச் செல்வதற்கு முன் உங்கள் மருந்து ஒவ்வாமை, சமீபத்திய அறுவை சிகிச்சை மற்றும் முக்கிய உறுப்பு அபாயங்களைப் பகிருங்கள். Scan Here-இல் ஸ்கேன் செய்யும் அனைத்து மருந்துகளும் இந்தத் தகவல்களுடன் இணைந்து இறுதி முடிவு அளிக்கப்படும்.',
    takeQuizBtn: 'ஆம், பாதுகாப்பு வினாடி-வினாவைத் தொடங்கு (~45 வினாடி)',
    skipQuizBtn: 'இப்போது தவிர்த்து முகப்புப் பக்கத்திற்குச் செல்',
    keepSavedBtn: 'சேமித்த தகவலுடன் முகப்புப் பக்கத்திற்குச் செல்',
    updateQuizBtn: 'வினாடி-வினாவைத் திருத்து / மீண்டும் எடு',
    stepTitles: [
      'மருந்து ஒவ்வாமைகள் & தீவிர எதிர்வினைகள்',
      'சமீபத்திய / வரவிருக்கும் அறுவை சிகிச்சை & இரத்தக்கசிவு',
      'முக்கிய உறுப்பு & உயிராபத்து காரணிகள்',
      'வயது, எடை & இறுதி சுருக்கம்',
    ],
    stepSubtitles: [
      'உங்களுக்கு அரிப்பு, தொண்டை வீக்கம், மூச்சுத்திணறல் ஏற்படுத்திய மருந்து வகைகளைத் தேர்ந்தெடுக்கவும்.',
      'அறுவை சிகிச்சைக்கு முன்னும் பின்னும் சில வலி நிவாரணிகள் மற்றும் நீரிழிவு மருந்துகள் ஆபத்தானவை.',
      'கல்லீரல், சிறுநீரகம், இதய துடிப்பு, குடல் புண், கர்ப்பம் போன்ற அபாயங்களைத் தேர்ந்தெடுக்கவும்.',
      'வயது மற்றும் எடையை உறுதிசெய்து உங்கள் சுயவிவரத்தைச் சேமிக்கவும்.',
    ],
    saveHomeBtn: 'சேமித்து முகப்புப் பக்கத்திற்குச் செல்',
    saveScanBtn: 'சேமித்து ஸ்கேனரைத் திற',
    backBtn: 'முந்தைய படி',
    nextBtn: 'அடுத்த படி',
  },
  hi: {
    gateKicker: 'चरण 0 · व्यक्तिगत गंभीर जोखिम जाँच',
    gateTitle: 'क्या आप पहले एक त्वरित स्वास्थ्य और सुरक्षा प्रश्नावली लेना चाहेंगे?',
    gateSubtitle:
      'होम पेज पर जाने से पहले दवा एलर्जी, हाल की सर्जरी और अंग-संबंधी जोखिम बताएं। Scan Here की हर रिपोर्ट इस प्रश्नावली से मिलकर आपका अंतिम सुरक्षित या असुरक्षित परिणाम तैयार करेगी।',
    takeQuizBtn: 'हाँ, त्वरित सुरक्षा प्रश्नावली लें (~45 सेकंड)',
    skipQuizBtn: 'अभी छोड़ें और होम पेज पर जाएं',
    keepSavedBtn: 'सहेजी गई प्रोफ़ाइल के साथ होम पेज पर जाएं',
    updateQuizBtn: 'प्रश्नावली अपडेट / दोबारा करें',
    stepTitles: [
      'दवा एलर्जी और गंभीर प्रतिक्रियाएँ',
      'हाल की या आगामी सर्जरी और रक्तस्राव जोखिम',
      'महत्वपूर्ण अंग और जानलेवा जोखिम कारक',
      'आयु, वजन और अंतिम सुरक्षा सारांश',
    ],
    stepSubtitles: [
      'वे दवा समूह चुनें जिनसे चकत्ते, गले में सूजन या सांस लेने में कठिनाई हुई हो।',
      'सर्जरी के आसपास दर्द निवारक (NSAIDs) और मेटफॉर्मिन घातक रक्तस्राव या लैक्टिक एसिडोसिस कर सकते हैं।',
      'लिवर, किडनी, हृदय गति, पेट अल्सर या गर्भावस्था जैसे कारक चुनें।',
      'स्कैनर के साथ सिंक करने के लिए आयु/वजन की पुष्टि करें और प्रोफ़ाइल सहेजें।',
    ],
    saveHomeBtn: 'प्रोफ़ाइल सहेजें और होम पर जाएं',
    saveScanBtn: 'सहेजें और स्कैनर खोलें',
    backBtn: 'पिछला चरण',
    nextBtn: 'आगे बढ़ें',
  },
};

export function PatientHealthQuizPage({
  mode,
  language,
  quizProfile,
  onLanguageChange,
  onCompleteQuiz,
  onSkipToHome,
  onKeepSavedToHome,
}: PatientHealthQuizPageProps) {
  const copy = QUIZ_COPY[language];
  const [showWizard, setShowWizard] = useState(mode === 'page');
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  const [draft, setDraft] = useState<PatientHealthQuiz>(() => ({
    ...EMPTY_PATIENT_HEALTH_QUIZ,
    ...quizProfile,
  }));

  const [ageInput, setAgeInput] = useState(
    quizProfile.patientAge !== undefined ? String(quizProfile.patientAge) : ''
  );
  const [weightInput, setWeightInput] = useState(
    quizProfile.patientWeightKg !== undefined ? String(quizProfile.patientWeightKg) : ''
  );

  const toggleAllergy = (id: DrugAllergyId) => {
    setDraft((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(id)
        ? prev.allergies.filter((a) => a !== id)
        : [...prev.allergies, id],
    }));
  };

  const toggleFatalFactor = (id: FatalRiskFactorId) => {
    setDraft((prev) => ({
      ...prev,
      fatalRiskFactors: prev.fatalRiskFactors.includes(id)
        ? prev.fatalRiskFactors.filter((f) => f !== id)
        : [...prev.fatalRiskFactors, id],
    }));
  };

  const finalizeAndSubmit = (target: 'home' | 'scan') => {
    const parsedAge = Number(ageInput);
    const parsedWeight = Number(weightInput);
    const completedQuiz: PatientHealthQuiz = {
      ...draft,
      decision: 'taken',
      completed: true,
      completedAt: new Date().toISOString().slice(0, 10),
      patientAge:
        ageInput.trim() !== '' && Number.isFinite(parsedAge) && parsedAge >= 0
          ? parsedAge
          : undefined,
      patientWeightKg:
        weightInput.trim() !== '' && Number.isFinite(parsedWeight) && parsedWeight > 0
          ? parsedWeight
          : undefined,
    };
    onCompleteQuiz(completedQuiz, target);
  };

  const activeRiskCount =
    draft.allergies.length +
    (draft.customAllergies.trim() ? 1 : 0) +
    (draft.surgeryStatus !== 'none' ? 1 : 0) +
    draft.fatalRiskFactors.length;

  // Initial App-Open Prompt Gate before proceeding to Home Page
  if (mode === 'gate' && !showWizard) {
    const hasSavedPreviousQuiz = quizProfile.completed || hasActiveQuizRisks(quizProfile);

    return (
      <div className="min-h-screen cellular-canvas text-[#1E221D] flex flex-col justify-center px-5 py-8">
        <div className="max-w-[820px] w-full mx-auto space-y-5">
          {/* Top brand & language bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="font-display text-2xl font-bold tracking-tight text-[#1E221D]">
                MedGuard
              </span>
              <span className="text-xs font-mono text-[#556B22] font-semibold">
                · CLINICAL INTAKE
              </span>
            </div>

            <div className="flex items-center gap-1 bg-[#FAF6EE] border border-[#D5C8B4] rounded-lg p-1">
              <Languages className="w-3.5 h-3.5 text-[#556B22] ml-1.5" />
              {(['en', 'ta', 'hi'] as LanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onLanguageChange(code)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
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

          <section className="organelle-panel rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-[#556B22]">
                <HeartPulse className="w-4 h-4" />
                <span>{copy.gateKicker}</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1E221D] leading-tight text-balance">
                {copy.gateTitle}
              </h1>
              <p className="text-sm text-[#4F544C] leading-relaxed">{copy.gateSubtitle}</p>
            </div>

            {/* What the 3-pillar quiz screens */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="organelle-subpanel rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#8B152A]">
                  <ShieldAlert className="w-4 h-4" />
                  <span>ALLERGIES</span>
                </div>
                <p className="text-xs text-[#3C4138] leading-relaxed">
                  Catches Penicillin anaphylaxis, NSAID hypersensitivity, Sulfa/Macrolide, and statin myopathy before a single tablet is taken.
                </p>
              </div>
              <div className="organelle-subpanel rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#BA5D33]">
                  <Scissors className="w-4 h-4" />
                  <span>RECENT SURGERY</span>
                </div>
                <p className="text-xs text-[#3C4138] leading-relaxed">
                  Screens past 30-day &amp; upcoming 14-day surgeries to block post-op NSAID bleeding and perioperative Metformin lactic acidosis.
                </p>
              </div>
              <div className="organelle-subpanel rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#29659B]">
                  <Activity className="w-4 h-4" />
                  <span>FATAL RISK FACTORS</span>
                </div>
                <p className="text-xs text-[#3C4138] leading-relaxed">
                  Maps severe liver/kidney failure, heart Long QT, GI ulcers, blood thinners, asthma triad &amp; pregnancy into every scan verdict.
                </p>
              </div>
            </div>

            {hasSavedPreviousQuiz && (
              <div className="rounded-xl p-4 bg-[#EAF5E9] border border-[#B4D9B1] text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-mono font-semibold text-[#245920]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PREVIOUSLY SAVED HEALTH SAFETY PROFILE FOUND</span>
                </div>
                <p className="text-[#1E221D] leading-relaxed">
                  {summarizeQuizProfile(quizProfile, language)}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E4D9C7]">
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  setShowWizard(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-sm font-semibold transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {hasSavedPreviousQuiz ? copy.updateQuizBtn : copy.takeQuizBtn}
              </button>

              {hasSavedPreviousQuiz && onKeepSavedToHome && (
                <button
                  type="button"
                  onClick={onKeepSavedToHome}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#29659B] hover:bg-[#1F507D] text-[#FCF9F4] text-sm font-semibold transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {copy.keepSavedBtn}
                </button>
              )}

              <button
                type="button"
                onClick={onSkipToHome}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-sm font-semibold transition-colors"
              >
                <span>{copy.skipQuizBtn}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // 4-Step Interactive Clinical Quiz (used both inside gate flow and standalone 'quiz' workspace page)
  const wrapperClass =
    mode === 'gate'
      ? 'min-h-screen cellular-canvas text-[#1E221D] px-5 py-8'
      : 'space-y-6';

  return (
    <div className={wrapperClass}>
      <div className={mode === 'gate' ? 'max-w-[920px] mx-auto space-y-5' : 'space-y-5'}>
        {mode === 'gate' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#556B22] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Welcome Choice
            </button>
            <button
              type="button"
              onClick={onSkipToHome}
              className="text-xs font-semibold text-[#555A50] hover:text-[#1E221D] underline"
            >
              {copy.skipQuizBtn}
            </button>
          </div>
        )}

        {/* Header & Stepper Progress */}
        <section className="organelle-panel rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="text-xs font-mono font-semibold text-[#556B22]">
                PATIENT HEALTH &amp; FATAL-RISK QUIZ · STEP {step + 1} OF 4
              </div>
              <h1 className="font-display text-2xl font-bold text-[#1E221D]">
                {copy.stepTitles[step]}
              </h1>
              <p className="text-xs sm:text-sm text-[#4F544C] leading-relaxed">
                {copy.stepSubtitles[step]}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
              <span className="px-3 py-1.5 rounded-lg bg-[#EFE7DA] border border-[#D5C8B4] text-[#1E221D] font-semibold">
                {activeRiskCount} active risk{activeRiskCount === 1 ? '' : 's'} selected
              </span>
            </div>
          </div>

          {/* 4-Step Tab Bar */}
          <div className="grid grid-cols-4 gap-2">
            {([0, 1, 2, 3] as const).map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                  step === idx
                    ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D] font-semibold'
                    : idx < step
                      ? 'bg-[#FAF6EE] border-[#B4D9B1] text-[#245920]'
                      : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#555A50] hover:border-[#B8A68B]'
                }`}
              >
                <div className="font-mono text-[10px]">STEP 0{idx + 1}</div>
                <div className="truncate">
                  {idx === 0
                    ? 'Allergies'
                    : idx === 1
                      ? 'Surgery'
                      : idx === 2
                        ? 'Fatal Risks'
                        : 'Verify & Save'}
                </div>
              </button>
            ))}
          </div>

          {/* STEP 1: Drug Allergies */}
          {step === 0 && (
            <div className="space-y-4 pt-2">
              <div className="grid md:grid-cols-2 gap-3">
                {DRUG_ALLERGY_OPTIONS.map((opt) => {
                  const selected = draft.allergies.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleAllergy(opt.id)}
                      className={`text-left rounded-xl p-4 border transition-colors flex items-start gap-3 ${
                        selected
                          ? 'bg-[#FCEBEF] border-[#B4233C]'
                          : 'bg-[#FCF9F4] border-[#D5C8B4] hover:border-[#8B152A]/50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-[#B4233C] border-[#B4233C] text-[#FCF9F4]'
                            : 'bg-[#FCF9F4] border-[#B8A68B] text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-semibold text-[#1E221D]">
                          {opt.label[language]}
                        </div>
                        <p className="text-xs text-[#4F544C] leading-snug">
                          {opt.fatalWarningHint[language]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="organelle-subpanel rounded-xl p-4 space-y-2">
                <label className="block text-xs font-semibold text-[#1E221D]">
                  Other Specific Medicine or Food Allergies (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={draft.customAllergies}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, customAllergies: e.target.value }))
                  }
                  placeholder="e.g., Metformin, Cefixime, Pantoprazole, Contrast Dye"
                  className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                />
                {draft.allergies.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, allergies: [], customAllergies: '' }))
                    }
                    className="text-xs text-[#556B22] font-semibold hover:underline"
                  >
                    Clear allergies (mark no known drug allergies)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Recent Surgery */}
          {step === 1 && (
            <div className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-3">
                {SURGICAL_STATUS_OPTIONS.map((opt) => {
                  const selected = draft.surgeryStatus === opt.id;
                  const isHazard = opt.id !== 'none';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          surgeryStatus: opt.id as SurgicalHistoryStatus,
                        }))
                      }
                      className={`text-left rounded-xl p-4 border transition-colors space-y-1.5 ${
                        selected
                          ? isHazard
                            ? 'bg-[#FDF5E3] border-[#B8841E]'
                            : 'bg-[#EAF5E9] border-[#3E7A3A]'
                          : 'bg-[#FCF9F4] border-[#D5C8B4] hover:border-[#637928]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#1E221D]">
                          {opt.label[language]}
                        </span>
                        {selected && (
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              isHazard ? 'text-[#B8841E]' : 'text-[#3E7A3A]'
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-xs text-[#4F544C] leading-relaxed">
                        {opt.detail[language]}
                      </p>
                    </button>
                  );
                })}
              </div>

              {draft.surgeryStatus !== 'none' && (
                <div className="organelle-subpanel rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-semibold text-[#1E221D]">
                    Procedure Type &amp; Date (optional, improves scanner warning accuracy)
                  </label>
                  <input
                    type="text"
                    value={draft.surgeryDetails ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, surgeryDetails: e.target.value }))
                    }
                    placeholder="e.g., Knee replacement 12 days ago, Dental extraction, Bypass surgery"
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Vital Organ & Fatal-End Risk Factors */}
          {step === 2 && (
            <div className="space-y-4 pt-2">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {FATAL_RISK_FACTOR_OPTIONS.map((opt) => {
                  const selected = draft.fatalRiskFactors.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleFatalFactor(opt.id)}
                      className={`text-left rounded-xl p-4 border transition-colors flex items-start gap-3 ${
                        selected
                          ? 'bg-[#FCEBEF] border-[#B4233C]'
                          : 'bg-[#FCF9F4] border-[#D5C8B4] hover:border-[#8B152A]/50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-[#B4233C] border-[#B4233C] text-[#FCF9F4]'
                            : 'bg-[#FCF9F4] border-[#B8A68B] text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-[#1E221D]">
                          {opt.label[language]}
                        </div>
                        <p className="text-[11px] text-[#4F544C] leading-snug">
                          {opt.fatalRationale[language]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="organelle-subpanel rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-semibold text-[#1E221D]">
                    Current Regular Medicines / Blood Thinners (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.currentMedicationsNote ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        currentMedicationsNote: e.target.value,
                      }))
                    }
                    placeholder="e.g., Warfarin, Clopidogrel, Insulin, Methotrexate"
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                  />
                </div>
                <div className="organelle-subpanel rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-semibold text-[#1E221D]">
                    Other Critical Clinical History Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.additionalHistoryNote ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        additionalHistoryNote: e.target.value,
                      }))
                    }
                    placeholder="e.g., G6PD deficiency, prior fainting, organ transplant"
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Baseline Age / Weight & Summary Lock-In */}
          {step === 3 && (
            <div className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="organelle-subpanel rounded-xl p-4 space-y-1.5">
                  <label className="block text-xs font-semibold text-[#1E221D]">
                    Patient Age (years — syncs directly to Prescription Scanner)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step="0.1"
                    value={ageInput}
                    onChange={(e) => setAgeInput(e.target.value)}
                    placeholder="e.g., 45 (or 0.5 for 6 months)"
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                  />
                </div>
                <div className="organelle-subpanel rounded-xl p-4 space-y-1.5">
                  <label className="block text-xs font-semibold text-[#1E221D]">
                    Patient Weight (kg — required for Pediatric weight dosing)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    step="0.5"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="e.g., 65 (or 16 for child)"
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-sm font-mono text-[#1E221D] focus:outline-none focus:border-[#556B22]"
                  />
                </div>
              </div>

              <div
                className={`rounded-xl p-4 border space-y-2 ${
                  activeRiskCount > 0
                    ? 'bg-[#FCEBEF] border-[#E2A9B3]'
                    : 'bg-[#EAF5E9] border-[#B4D9B1]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                  {activeRiskCount > 0 ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-[#B4233C]" />
                      <span className="text-[#8B152A]">
                        COMBINED SCANNER LOCK-IN: {activeRiskCount} PERSONAL RISK FACTOR(S) WILL BE ENFORCED
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#245920]" />
                      <span className="text-[#245920]">
                        CLEAN SAFETY BASELINE READY FOR SCANNER COMBINATION
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-[#2B3028] leading-relaxed">
                  {summarizeQuizProfile(
                    {
                      ...draft,
                      decision: 'taken',
                      completed: true,
                    },
                    language
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E4D9C7]">
            <div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2 | 3) : 0))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#EFE7DA] hover:bg-[#E5DAC7] text-[#1E221D] text-xs font-semibold transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {copy.backBtn}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 0 | 1 | 2 | 3) : 3))}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors"
                >
                  <span>{copy.nextBtn}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => finalizeAndSubmit('home')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#637928] bg-[#EAF0DC] hover:bg-[#DEE8C8] text-[#1E221D] text-xs font-semibold transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#556B22]" />
                    {copy.saveHomeBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => finalizeAndSubmit('scan')}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors"
                  >
                    <span>{copy.saveScanBtn}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
