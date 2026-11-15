import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Compass,
  Languages,
  MessageSquare,
  RotateCcw,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import type { SavedCheckRecord } from '../firebase.ts';
import type {
  AppPageId,
  GuideChatContext,
  GuideChatResponse,
  GuideChatTurn,
  GuideUserPersona,
  LanguageCode,
  VerificationReport,
} from '../types/medguard.ts';

interface ChatThreadMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  suggestedPages?: AppPageId[];
  suggestedQuestions?: string[];
  timestampLabel: string;
}

interface MedGuardChatbotProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  userName?: string | null;
  isSignedIn: boolean;
  language: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  activePage: AppPageId;
  savedChecks: SavedCheckRecord[];
  latestReport: VerificationReport | null;
  onNavigate: (page: AppPageId) => void;
}

const PAGE_DIRECTORY: Record<
  AppPageId,
  { label: Record<LanguageCode, string>; requirementHint: Record<LanguageCode, string> }
> = {
  home: {
    label: { en: 'Home Directory', ta: 'முகப்பு', hi: 'होम पेज' },
    requirementHint: {
      en: 'Overview of all modules',
      ta: 'அனைத்து அம்சங்களின் பார்வை',
      hi: 'सभी सुविधाओं का परिचय',
    },
  },
  scan: {
    label: { en: 'Scan Here', ta: 'இங்கே ஸ்கேன் செய்யவும்', hi: 'यहाँ स्कैन करें' },
    requirementHint: {
      en: 'Needs photo/PDF/DOCX/text + age & condition',
      ta: 'படம்/PDF/DOCX/உரை + வயது & நோய்',
      hi: 'फोटो/PDF/DOCX/टेक्स्ट + आयु और रोग',
    },
  },
  remediation: {
    label: { en: 'To-Do Next Plan', ta: 'அடுத்த செயல் திட்டம்', hi: 'आगे की कार्य योजना' },
    requirementHint: {
      en: 'Step-by-step remediation & safety checks',
      ta: 'படிப்படியான செயல் & பாதுகாப்புப் படிகள்',
      hi: 'चरणबद्ध सुधार और सुरक्षा उपाय',
    },
  },
  'test-cases': {
    label: { en: 'Test Cases', ta: 'மாதிரி சோதனைகள்', hi: 'टेस्ट केस' },
    requirementHint: {
      en: 'No upload required — 1-click scenarios',
      ta: 'பதிவேற்றம் தேவையில்லை — உடனடி சோதனை',
      hi: 'बिना अपलोड के 1-क्लिक उदाहरण',
    },
  },
  cell: {
    label: { en: 'Cell Structure 3D', ta: 'செல்லின் 3D அமைப்பு', hi: 'कोशिका 3D संरचना' },
    requirementHint: {
      en: 'Interactive 3D organelle atlas',
      ta: '3D செல் உறுப்புகள் வரைபடம்',
      hi: '3D कोशिका एटलस',
    },
  },
  mechanism: {
    label: { en: 'AlphaFold 3D', ta: 'AlphaFold 3D புரதம்', hi: 'AlphaFold 3D तंत्र' },
    requirementHint: {
      en: 'Select enzyme target (CYP3A4, hERG, etc.)',
      ta: 'புரத இலக்கைத் தேர்ந்தெடுக்கவும்',
      hi: 'प्रोटीन लक्ष्य चुनें',
    },
  },
  facility: {
    label: { en: 'Facility Watchlist', ta: 'மருந்தக இருப்புப் பட்டியல்', hi: 'फ़ार्मेसी वॉचलिस्ट' },
    requirementHint: {
      en: 'Batch no. & ingredient for recall sweep',
      ta: 'தொகுப்பு எண் & மருந்துப் பெயர்',
      hi: 'बैच नंबर और दवा नाम',
    },
  },
  pharmacist: {
    label: { en: 'Pharmacist Queue', ta: 'மருந்தாளர் மதிப்பாய்வு', hi: 'फ़ार्मासिस्ट कतार' },
    requirementHint: {
      en: 'Clinical governance escalation triage',
      ta: 'மருந்தாளர் ஆய்வு வரிசை',
      hi: 'फ़ार्मासिस्ट समीक्षा कतार',
    },
  },
};

const PERSONA_OPTIONS: Array<{
  id: GuideUserPersona;
  label: Record<LanguageCode, string>;
  starterPrompt: Record<LanguageCode, string>;
}> = [
  {
    id: 'patient',
    label: { en: 'Patient / Family', ta: 'நோயாளி / குடும்பம்', hi: 'रोगी / परिवार' },
    starterPrompt: {
      en: 'I want to verify a family prescription. Which feature should I use and what do I need?',
      ta: 'மருந்துச்சீட்டை சரிபார்க்க எந்த அம்சத்தை பயன்படுத்த வேண்டும்? என்ன விவரங்கள் தேவை?',
      hi: 'मुझे प्रिस्क्रिप्शन जाँचना है। कौन सी सुविधा चुनूँ और क्या विवरण चाहिए?',
    },
  },
  {
    id: 'pediatric',
    label: { en: 'Pediatric Dose', ta: 'குழந்தை அளவு', hi: 'बच्चों की खुराक' },
    starterPrompt: {
      en: 'I am checking a child’s medicine dosage. How do I use Scan Here for pediatric weight and safety checks?',
      ta: 'குழந்தையின் மருந்து அளவை சரிபார்க்க Scan Here-இல் எடை மற்றும் பாதுகாப்பு சோதனையை எப்படி செய்வது?',
      hi: 'बच्चे की दवा की खुराक और वजन सुरक्षा जाँचने के लिए Scan Here का उपयोग कैसे करें?',
    },
  },
  {
    id: 'pharmacist',
    label: { en: 'Pharmacist / Clinic', ta: 'மருந்தாளர் / கிளினிக்', hi: 'फ़ार्मासिस्ट / क्लिनिक' },
    starterPrompt: {
      en: 'I am a pharmacist. Walk me through Facility Watchlist, recall sweeps, and Pharmacist Queue.',
      ta: 'நான் மருந்தாளர். Facility Watchlist மற்றும் Pharmacist Queue தேவைகளை விளக்கவும்.',
      hi: 'मैं फ़ार्मासिस्ट हूँ। Facility Watchlist और Pharmacist Queue की आवश्यकताएँ बताएं।',
    },
  },
  {
    id: 'explorer',
    label: { en: '3D Science', ta: '3D அறிவியல்', hi: '3D विज्ञान' },
    starterPrompt: {
      en: 'How do I explore Cell Structure 3D and AlphaFold 3D protein pockets for my medicines?',
      ta: 'என் மருந்துகளுக்கான Cell 3D மற்றும் AlphaFold 3D புரதப் பார்வையை எப்படி பார்ப்பது?',
      hi: 'दवाओं के लिए Cell 3D और AlphaFold 3D प्रोटीन पॉकेट कैसे देखें?',
    },
  },
];

function renderFormattedReply(text: string) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-[#1E221D]">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Render inline **bold** segments safely without dangerouslySetInnerHTML
        const segments = trimmed.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={idx} className={trimmed.startsWith('•') || /^\d+\./.test(trimmed) ? 'pl-1' : ''}>
            {segments.map((seg, sIdx) => {
              if (seg.startsWith('**') && seg.endsWith('**')) {
                return (
                  <strong key={sIdx} className="font-semibold text-[#1E221D]">
                    {seg.slice(2, -2)}
                  </strong>
                );
              }
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return (
                  <code
                    key={sIdx}
                    className="font-mono text-[11px] bg-[#EFE7DA] px-1 py-0.5 rounded text-[#3E5215]"
                  >
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              return <span key={sIdx}>{seg}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MedGuardChatbot({
  isOpen,
  onToggle,
  userName,
  isSignedIn,
  language,
  onLanguageChange,
  activePage,
  savedChecks,
  latestReport,
  onNavigate,
}: MedGuardChatbotProps) {
  const [persona, setPersona] = useState<GuideUserPersona>('patient');
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastFailedInput, setLastFailedInput] = useState<string>('');

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const personalizedWelcome = useMemo<ChatThreadMessage>(() => {
    const firstName = userName?.trim().split(' ')[0];
    const currentLabel = PAGE_DIRECTORY[activePage].label[language];

    let body = '';
    let suggestedPages: AppPageId[] = ['scan', 'test-cases', 'mechanism'];
    let suggestedQuestions: string[] = [
      'What files and details do I need for Scan Here?',
      'How do I check a pediatric dose with weight?',
      'How do I inspect drug targets in 3D?',
    ];

    if (language === 'ta') {
      body = `${firstName ? `வணக்கம் ${firstName}! ` : 'MedGuard வழிகாட்டிக்கு வரவேற்கிறோம்! '}நீங்கள் இப்போது **${currentLabel}** பகுதியில் உள்ளீர்கள்.${
        latestReport
          ? `\n\nஉங்கள் தற்போதைய ஆய்வு முடிவு: **${latestReport.overallVerdict}** (${latestReport.patientCondition}, ${latestReport.patientAge} வயது). இதற்கான **${latestReport.primaryMechanismId}** புரதத்தை **AlphaFold 3D**-இல் பார்க்கலாம்.`
          : '\n\nஉங்கள் தேவைக்கு ஏற்ப சரியான அம்சத்தையும், அதற்குத் தேவையான விவரங்களையும் நான் வழிகாட்டுவேன்.'
      }`;
      suggestedQuestions = [
        'Scan Here-க்கு என்ன ஆவணங்கள் தேவை?',
        'குழந்தை மருந்து அளவை எப்படி சரிபார்ப்பது?',
        'Test Cases மூலம் எப்படி சோதிப்பது?',
      ];
    } else if (language === 'hi') {
      body = `${firstName ? `नमस्ते ${firstName}! ` : 'MedGuard गाइड में स्वागत है! '}आप अभी **${currentLabel}** पर हैं।${
        latestReport
          ? `\n\nआपकी सक्रिय जाँच रिपोर्ट: **${latestReport.overallVerdict}** (${latestReport.patientCondition}, आयु ${latestReport.patientAge})। आप **${latestReport.primaryMechanismId}** को **AlphaFold 3D** में देख सकते हैं।`
          : '\n\nबताएं आप क्या करना चाहते हैं—मैं सही सुविधा और उसकी आवश्यक जानकारी तुरंत बताऊँगा।'
      }`;
      suggestedQuestions = [
        'Scan Here में क्या-क्या अपलोड कर सकते हैं?',
        'बच्चों की खुराक और वजन कैसे जाँचें?',
        '3D कोशिका और प्रोटीन दृश्य कैसे देखें?',
      ];
    } else {
      body = `${firstName ? `Hi ${firstName} — ` : 'Welcome to MedGuard — '}you’re currently on **${currentLabel}**.${
        latestReport
          ? `\n\nI see your active **${latestReport.overallVerdict}** audit for **${latestReport.patientCondition}** (age ${latestReport.patientAge}). Ask me what to check next, or jump straight to **${latestReport.primaryMechanismId}** in **AlphaFold 3D**.`
          : isSignedIn && savedChecks.length > 0
            ? `\n\nYou have **${savedChecks.length}** saved check${savedChecks.length === 1 ? '' : 's'} in your account. Tell me what you’d like to do next and I’ll point you to the right feature and its exact requirements.`
            : '\n\nSelect your focus below or ask me anything—I’ll guide you to the right MedGuard module and list exactly what inputs or files you need.'
      }`;
    }

    if (latestReport) {
      suggestedPages = ['remediation', 'mechanism', 'cell'];
    }

    return {
      id: 'welcome-personalized',
      role: 'model',
      text: body,
      suggestedPages,
      suggestedQuestions,
      timestampLabel: formatNowTime(),
    };
  }, [userName, isSignedIn, savedChecks.length, latestReport, activePage, language]);

  const displayedMessages = useMemo(
    () => [personalizedWelcome, ...messages],
    [personalizedWelcome, messages]
  );

  useEffect(() => {
    if (!isOpen) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayedMessages, busy, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const buildContextPayload = (overridePersona?: GuideUserPersona): GuideChatContext => {
    const recent = savedChecks[0];
    return {
      userName: userName || undefined,
      isSignedIn,
      language,
      activePage,
      persona: overridePersona ?? persona,
      savedChecksCount: savedChecks.length,
      recentSavedSummary: recent
        ? `${recent.patientCondition} (${recent.patientAge}y): ${recent.verdict}`
        : undefined,
      latestReport: latestReport
        ? {
            overallVerdict: latestReport.overallVerdict,
            patientCondition: latestReport.patientCondition,
            patientAge: latestReport.patientAge,
            primaryMechanismId: latestReport.primaryMechanismId,
            ragFlags: latestReport.summaryStats.ragFlags,
            dosageIssues: latestReport.summaryStats.dosageIssues,
            regimenFlags: latestReport.summaryStats.regimenFlags,
            packAlerts: latestReport.summaryStats.packAlerts,
          }
        : undefined,
    };
  };

  const sendMessage = async (
    rawText: string,
    overridePersona?: GuideUserPersona,
    isRetry = false
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || busy) return;

    setError('');
    setLastFailedInput('');

    const historyBeforeSend: GuideChatTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    if (!isRetry) {
      const userTurn: ChatThreadMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestampLabel: formatNowTime(),
      };
      setMessages((prev) => [...prev, userTurn]);
      setInput('');
    }

    setBusy(true);
    try {
      const res = await fetch('/api/chat/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyBeforeSend,
          context: buildContextPayload(overridePersona),
        }),
      });
      const data = (await res.json()) as GuideChatResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'MedGuard Guide could not respond right now.');
      }

      const modelTurn: ChatThreadMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.reply,
        suggestedPages: data.suggestedPages,
        suggestedQuestions: data.suggestedQuestions,
        timestampLabel: formatNowTime(),
      };
      setMessages((prev) => [...prev, modelTurn]);
    } catch (err) {
      setLastFailedInput(trimmed);
      setError(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setBusy(false);
    }
  };

  const handlePersonaSelect = (nextPersona: GuideUserPersona) => {
    setPersona(nextPersona);
    const option = PERSONA_OPTIONS.find((p) => p.id === nextPersona);
    if (option) {
      void sendMessage(option.starterPrompt[language], nextPersona);
    }
  };

  return (
    <>
      {/* Persistent Dock Trigger when closed */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => onToggle(true)}
          aria-label="Open MedGuard Guide assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] shadow-lg border border-[#3F5117] text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B22]"
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>
            {language === 'ta'
              ? 'MedGuard வழிகாட்டி'
              : language === 'hi'
                ? 'MedGuard गाइड'
                : 'MedGuard Guide'}
          </span>
        </button>
      )}

      {/* Multi-turn Personalized Guide Drawer */}
      {isOpen && (
        <aside
          aria-label="MedGuard Personalized Guide Chat"
          className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[430px] h-[min(640px,calc(100vh-2rem))] rounded-xl border border-[#C6B69E] bg-[#FCF9F4] shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-[#FAF6EE] border-b border-[#D5C8B4] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#556B22] shrink-0" />
                <h2 className="font-display text-sm font-bold text-[#1E221D] truncate">
                  MedGuard Guide
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#555A50] truncate mt-0.5">
                <UserCheck className="w-3 h-3 text-[#556B22] shrink-0" />
                <span>{userName ? userName.split(' ')[0] : 'Guest'}</span>
                <span aria-hidden="true">·</span>
                <span>{PAGE_DIRECTORY[activePage].label[language]}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError('');
                    setLastFailedInput('');
                  }}
                  title="New conversation"
                  className="p-2 rounded-lg text-[#555A50] hover:text-[#1E221D] hover:bg-[#EFE7DA] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggle(false)}
                aria-label="Close MedGuard Guide"
                className="p-2 rounded-lg text-[#555A50] hover:text-[#1E221D] hover:bg-[#EFE7DA] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Personalization Language & Role Selector Bar */}
          <div className="px-3 py-2.5 bg-[#F5EFE4] border-b border-[#E4D9C7] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#555A50]">
                <Languages className="w-3.5 h-3.5 text-[#556B22]" />
                <span>
                  {language === 'ta'
                    ? 'மொழி'
                    : language === 'hi'
                      ? 'भाषा'
                      : 'LANGUAGE'}
                </span>
              </div>
              <div
                role="group"
                aria-label="Select guide language"
                className="flex items-center gap-1 bg-[#FCF9F4] border border-[#D5C8B4] rounded-lg p-0.5"
              >
                {(
                  [
                    ['en', 'English'],
                    ['ta', 'தமிழ்'],
                    ['hi', 'हिन्दी'],
                  ] as const
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onLanguageChange(code)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                      language === code
                        ? 'bg-[#556B22] text-[#FCF9F4]'
                        : 'text-[#4F544C] hover:text-[#1E221D]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-[#555A50] mb-1">
                {language === 'ta'
                  ? 'உங்கள் தேவையைத் தேர்ந்தெடுக்கவும்'
                  : language === 'hi'
                    ? 'अपनी भूमिका चुनें'
                    : 'TAILOR GUIDANCE BY ROLE'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {PERSONA_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePersonaSelect(opt.id)}
                    disabled={busy}
                    className={`px-2 py-1.5 rounded-md text-[11px] font-semibold text-center transition-colors truncate ${
                      persona === opt.id
                        ? 'bg-[#556B22] text-[#FCF9F4]'
                        : 'bg-[#FCF9F4] text-[#4F544C] border border-[#D5C8B4] hover:border-[#556B22] hover:text-[#1E221D]'
                    }`}
                  >
                    {opt.label[language]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable Multi-Turn Conversation Thread */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4 bg-[#FCF9F4]"
          >
            {displayedMessages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#6C6F66]">
                    <span>{isUser ? userName?.split(' ')[0] || 'You' : 'MedGuard Guide'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{msg.timestampLabel}</span>
                  </div>

                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 border ${
                      isUser
                        ? 'bg-[#EAF0DC] border-[#BACB93] text-[#1E221D]'
                        : 'bg-[#FAF6EE] border-[#D5C8B4] text-[#1E221D]'
                    }`}
                  >
                    {renderFormattedReply(msg.text)}
                  </div>

                  {/* Direct Feature Navigation Shortcuts with Requirement Hints */}
                  {!isUser && msg.suggestedPages && msg.suggestedPages.length > 0 && (
                    <div className="w-full max-w-[92%] space-y-1.5 pt-0.5">
                      <div className="text-[10px] font-mono text-[#555A50]">
                        RECOMMENDED FEATURES
                      </div>
                      <div className="grid gap-1.5">
                        {msg.suggestedPages.map((pageId) => {
                          const meta = PAGE_DIRECTORY[pageId];
                          const isCurrent = activePage === pageId;
                          return (
                            <button
                              key={pageId}
                              type="button"
                              onClick={() => onNavigate(pageId)}
                              className="w-full text-left px-3 py-2 rounded-lg border border-[#D5C8B4] bg-[#FCF9F4] hover:bg-[#EFE7DA] hover:border-[#556B22] transition-colors flex items-center justify-between gap-2 group"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#1E221D] flex items-center gap-1.5">
                                  <span>{meta.label[language]}</span>
                                  {isCurrent && (
                                    <span className="text-[10px] font-mono text-[#556B22]">
                                      · Current
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#555A50] truncate">
                                  {meta.requirementHint[language]}
                                </div>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-[#556B22] shrink-0 transition-transform group-hover:translate-x-0.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Interactive Follow-Up Prompts */}
                  {!isUser &&
                    msg.suggestedQuestions &&
                    msg.suggestedQuestions.length > 0 && (
                      <div className="w-full max-w-[92%] flex flex-col items-start gap-1 pt-0.5">
                        {msg.suggestedQuestions.map((qText) => (
                          <button
                            key={qText}
                            type="button"
                            disabled={busy}
                            onClick={() => void sendMessage(qText)}
                            className="text-left text-[11px] font-medium text-[#556B22] hover:text-[#3E5215] hover:underline py-0.5"
                          >
                            &rarr; {qText}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-start flex-col space-y-1">
                <span className="text-[10px] font-mono text-[#6C6F66]">
                  MedGuard Guide · thinking
                </span>
                <div className="rounded-xl px-3.5 py-2.5 border border-[#D5C8B4] bg-[#FAF6EE] text-xs text-[#555A50]">
                  Preparing personalized guidance...
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl p-3 bg-[#FCEBEF] border border-[#E2A9B3] text-xs text-[#8B152A] space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#B4233C] shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                {lastFailedInput && (
                  <button
                    type="button"
                    onClick={() => void sendMessage(lastFailedInput, undefined, true)}
                    className="px-3 py-1 rounded bg-[#B4233C] text-[#FCF9F4] text-[11px] font-semibold hover:bg-[#961B30]"
                  >
                    Retry message
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="p-3 bg-[#FAF6EE] border-t border-[#D5C8B4] flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder={
                language === 'ta'
                  ? 'எந்த அம்சம் அல்லது தேவை குறித்து கேளுங்கள்...'
                  : language === 'hi'
                    ? 'किस सुविधा या आवश्यकता के बारे में पूछना है?'
                    : 'Ask which feature to use or what inputs you need...'
              }
              className="flex-1 resize-none rounded-lg border border-[#C6B69E] bg-[#FCF9F4] px-3 py-2 text-xs text-[#1E221D] placeholder:text-[#7B7F75] focus:outline-none focus:border-[#556B22]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="h-10 px-3.5 rounded-lg bg-[#556B22] hover:bg-[#46591B] disabled:opacity-45 text-[#FCF9F4] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
