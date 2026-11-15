import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft, LogOut, Square, Volume2 } from 'lucide-react';
import { CellStructure3D } from './components/CellStructure3D.tsx';
import { FacilityWatchlist } from './components/FacilityWatchlist.tsx';
import { HomePage, type AppPage } from './components/HomePage.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { MechanismLens3D } from './components/MechanismLens3D.tsx';
import { MedicationDatabasePage } from './components/MedicationDatabasePage.tsx';
import { PharmacistQueue } from './components/PharmacistQueue.tsx';
import { PrescriptionWorkspace } from './components/PrescriptionWorkspace.tsx';
import { TestCasesPage } from './components/TestCasesPage.tsx';
import { MECHANISM_TARGETS } from './data/medguardCatalog.ts';
import {
  auth,
  deleteSavedCheck,
  ensureUserProfile,
  fetchUserSavedChecks,
  signOutAccount,
  updateUserPreferredLanguage,
  type SavedCheckRecord,
} from './firebase.ts';
import type {
  LanguageCode,
  MechanismTargetId,
  SamplePreset,
  VerificationReport,
} from './types/medguard.ts';

function buildSpeechScript(report: VerificationReport, language: LanguageCode): string {
  const mech = MECHANISM_TARGETS[report.primaryMechanismId];
  const dosageAlerts = report.dosageAudits.filter((d) => d.status !== 'Appropriate');

  if (language === 'ta') {
    const statusText =
      report.overallVerdict === 'SAFE_TO_TAKE'
        ? `மருந்து அளவு மற்றும் பாதுகாப்பு நிலை: பாதுகாப்பானது (${report.asOfDate} நிலவரப்படி).`
        : report.overallVerdict === 'CAUTION_REVIEW'
          ? 'மருந்து அளவு மற்றும் பாதுகாப்பு நிலை: எச்சரிக்கை, மருத்துவரிடம் அல்லது மருந்தாளரிடம் சரிபார்க்கவும்.'
          : 'மருந்து அளவு மற்றும் பாதுகாப்பு நிலை: உடனடி மருத்துவ கவனம் தேவை.';

    const dosageSummaryTa =
      dosageAlerts.length > 0
        ? dosageAlerts
            .map(
              (d) =>
                `${d.brandName} தினசரி அளவு ${d.prescribedDailyMg} மில்லிகிராம், நிலை: ${d.status}.`
            )
            .join(' ')
        : 'அனைத்து மருந்துகளின் தினசரி அளவும் பாதுகாப்பான வரம்பிற்குள் உள்ளது.';

    const mechTa = `AlphaFold மற்றும் செல் உள் அமைப்பு விளக்கம்: ${mech.name} நொதி செல்லின் ${mech.cellularOrganelle} பகுதியில் செயல்படுகிறது. ${mech.explanationSummary}`;
    return `${statusText} ${dosageSummaryTa} ${mechTa}`;
  }

  if (language === 'hi') {
    const statusTextHi =
      report.overallVerdict === 'SAFE_TO_TAKE'
        ? `खुराक और सुरक्षा स्थिति: सुरक्षित (${report.asOfDate} तक)।`
        : 'खुराक और सुरक्षा स्थिति: सावधानी, कृपया डॉक्टर या फ़ार्मासिस्ट से जाँच कराएँ।';
    const mechHi = `AlphaFold और कोशिका तंत्र विवरण: ${mech.name} कोशिका के ${mech.cellularOrganelle} में कार्य करता है। ${mech.explanationSummary}`;
    return `${statusTextHi} ${mechHi}`;
  }

  const statusTextEn =
    report.overallVerdict === 'SAFE_TO_TAKE'
      ? `Dosage safety status: Safe within verified guidelines as of ${report.asOfDate}.`
      : report.overallVerdict === 'CAUTION_REVIEW'
        ? 'Dosage safety status: Caution. Review recommended with your doctor or pharmacist.'
        : 'Dosage safety status: Action required. Safety or dosage limit issue detected.';

  const dosageSummaryEn =
    dosageAlerts.length > 0
      ? dosageAlerts
          .map(
            (d) =>
              `${d.brandName} at ${d.prescribedDailyMg} milligrams per day is flagged as ${d.status}.`
          )
          .join(' ')
      : 'All prescribed daily dosages are within standard regulatory limits.';

  const mechEn = `Cellular and AlphaFold mechanism explanation for ${mech.name} in the ${mech.cellularOrganelle}: ${mech.explanationSummary} ${mech.clinicalImplication}`;
  return `${statusTextEn} ${dosageSummaryEn} ${mechEn}`;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestAccess, setGuestAccess] = useState(false);

  const [activePage, setActivePage] = useState<AppPage>('home');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [mechanismTarget, setMechanismTarget] = useState<MechanismTargetId>('CYP3A4');
  const [selectedPreset, setSelectedPreset] = useState<{
    preset: SamplePreset;
    autoVerify: boolean;
    nonce: number;
  } | null>(null);
  const [lastReport, setLastReport] = useState<VerificationReport | null>(null);
  const [savedChecks, setSavedChecks] = useState<SavedCheckRecord[]>([]);
  const [checksLoading, setChecksLoading] = useState(false);
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadChecks = useCallback(async (uid: string) => {
    setChecksLoading(true);
    try {
      const list = await fetchUserSavedChecks(uid);
      setSavedChecks(list);
    } catch {
      setSavedChecks([]);
    } finally {
      setChecksLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        setGuestAccess(false);
        void ensureUserProfile(
          currentUser.uid,
          currentUser.displayName || 'MedGuard User',
          currentUser.email || '',
          language
        ).then((profile) => {
          setLanguage(profile.preferredLanguage);
          void loadChecks(currentUser.uid);
        });
      } else {
        setSavedChecks([]);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadChecks]);

  const handleLanguageChange = useCallback(
    (nextLang: LanguageCode) => {
      setLanguage(nextLang);
      if (user) {
        void updateUserPreferredLanguage(user.uid, nextLang);
      }
    },
    [user]
  );

  const stopSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakAnalysisSummary = useCallback(
    async (report: VerificationReport, targetLanguage: LanguageCode) => {
      stopSpeech();
      const script = buildSpeechScript(report, targetLanguage);
      if (!script.trim()) return;

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: script, language: targetLanguage }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.audioBase64) {
            const audio = new Audio(
              `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
            );
            audioRef.current = audio;
            audio.onended = () => setIsSpeaking(false);
            audio.onerror = () => setIsSpeaking(false);
            setIsSpeaking(true);
            await audio.play();
            return;
          }
        }
      } catch {
        // Browser Web Speech fallback below
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(script);
        const prefix =
          targetLanguage === 'ta' ? 'ta' : targetLanguage === 'hi' ? 'hi' : 'en';
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith(prefix)
        );
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.lang =
          preferredVoice?.lang ??
          (targetLanguage === 'ta'
            ? 'ta-IN'
            : targetLanguage === 'hi'
              ? 'hi-IN'
              : 'en-IN');
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }
    },
    [stopSpeech]
  );

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  const handleReportReady = useCallback(
    (report: VerificationReport) => {
      setLastReport(report);
      if (autoSpeakEnabled) {
        void speakAnalysisSummary(report, language);
      }
    },
    [autoSpeakEnabled, language, speakAnalysisSummary]
  );

  const highlightedMechanisms = useMemo<MechanismTargetId[]>(() => {
    if (!lastReport) return ['CYP3A4', 'AMPK'];
    const ids = new Set<MechanismTargetId>([lastReport.primaryMechanismId]);
    lastReport.regimenFindings.forEach((f) => {
      if (f.mechanismTargetId) ids.add(f.mechanismTargetId);
    });
    return Array.from(ids);
  }, [lastReport]);

  const openMechanism = (targetId: MechanismTargetId) => {
    setMechanismTarget(targetId);
    setActivePage('mechanism');
  };

  const handleSelectTestCase = (preset: SamplePreset, autoVerify: boolean) => {
    setSelectedPreset({ preset, autoVerify, nonce: Date.now() });
    setActivePage('scan');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen cellular-canvas text-[#1E221D] flex items-center justify-center p-6">
        <div className="organelle-panel rounded-xl px-6 py-4 text-sm font-medium text-[#4F544C]">
          Loading MedGuard workspace...
        </div>
      </div>
    );
  }

  if (!user && !guestAccess) {
    return (
      <LoginPage
        language={language}
        onLanguageChange={handleLanguageChange}
        onContinueGuest={() => setGuestAccess(true)}
      />
    );
  }

  const navItems: Array<[AppPage, string]> = [
    ['home', 'Home'],
    ['scan', 'Scan Here'],
    ['test-cases', 'Test Cases'],
    ['formulary', 'Pediatric RAG DB'],
    ['cell', 'Cell 3D'],
    ['mechanism', 'AlphaFold 3D'],
  ];

  const pageLabels: Record<AppPage, string> = {
    home: 'Home',
    scan: 'Scan Here',
    'test-cases': 'Test Cases',
    formulary: 'Pediatric Medication RAG DB',
    cell: 'Cell Structure 3D',
    mechanism: 'AlphaFold 3D',
    facility: 'Facility Watchlist',
    pharmacist: 'Pharmacist Queue',
  };

  return (
    <div className="min-h-screen cellular-canvas text-[#1E221D] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-[#D5C8B4] bg-[#FAF6EE]/95">
        <div className="max-w-[1280px] mx-auto px-5 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="font-display text-xl font-bold tracking-tight text-[#1E221D] whitespace-nowrap shrink-0 text-left"
          >
            MedGuard
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#555A50]">
            {navItems.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActivePage(id)}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
                  activePage === id
                    ? 'text-[#1E221D] font-semibold border-b-2 border-[#556B22]'
                    : 'hover:text-[#1E221D]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setGuestAccess(false);
                  void signOutAccount();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-[#556B22]" />
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGuestAccess(false)}
                className="px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-[#E4D9C7] px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs">
          {(
            [
              ['home', 'Home'],
              ['scan', 'Scan Here'],
              ['test-cases', 'Test Cases'],
              ['formulary', 'RAG DB'],
              ['cell', 'Cell 3D'],
              ['mechanism', 'AlphaFold 3D'],
              ['facility', 'Facility'],
              ['pharmacist', 'Pharmacist'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePage(id)}
              className={`whitespace-nowrap shrink-0 font-medium ${
                activePage === id ? 'text-[#556B22] font-semibold' : 'text-[#555A50]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-5 py-6 space-y-6">
        {activePage === 'home' ? (
          <>
            {/* Main Page Cellular Hero Banner */}
            <section className="organelle-panel rounded-xl px-6 py-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#556B22] font-medium">
                  <span>CELLULAR MECHANISM & PRESCRIPTION SAFETY</span>
                  <span aria-hidden="true">·</span>
                  <span>ENGLISH / தமிழ் / हिन्दी</span>
                  {user && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#74559C]">{user.displayName || user.email}</span>
                    </>
                  )}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1E221D] tracking-tight text-balance">
                  {language === 'ta'
                    ? 'மருந்துச்சீட்டை மொழிபெயர்த்து, அளவு, நோய் பொருத்தம் & செல்லின் உள் செயல்பாட்டைச் சரிபார்க்கவும்'
                    : language === 'hi'
                      ? 'प्रिस्क्रिप्शन का अनुवाद करें, खुराक, बीमारी का मिलान और कोशिका तंत्र जाँचें'
                      : 'Translate prescriptions, audit dosage & disease match, and explore cellular AlphaFold mechanisms.'}
                </h1>
                <p className="text-sm text-[#4F544C] leading-relaxed">
                  Check prescription dosage limits, disease match, and drug interactions in English, Tamil, or Hindi with voice readout and interactive 3D cellular protein views.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSpeakEnabled((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                    autoSpeakEnabled
                      ? 'border-[#637928] bg-[#EAF0DC] text-[#1E221D]'
                      : 'border-[#C6B69E] bg-[#EFE7DA] text-[#4F544C]'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#556B22]" />
                  {autoSpeakEnabled ? 'Auto-Voice: On' : 'Auto-Voice: Off'}
                </button>
                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={stopSpeech}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B4233C] hover:bg-[#961B30] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop Voice
                  </button>
                ) : (
                  lastReport && (
                    <button
                      type="button"
                      onClick={() => void speakAnalysisSummary(lastReport, language)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#B4D9B1] bg-[#EAF5E9] hover:bg-[#DDF0DB] text-[#245920] text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Replay Summary
                    </button>
                  )
                )}
              </div>
            </section>

            <HomePage
              language={language}
              userId={user?.uid ?? null}
              savedChecks={savedChecks}
              checksLoading={checksLoading}
              onSelectPage={setActivePage}
              onOpenMechanism={openMechanism}
              onDeleteSavedCheck={(checkId) => {
                if (user) {
                  void deleteSavedCheck(user.uid, checkId).then(() => loadChecks(user.uid));
                }
              }}
            />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActivePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#556B22] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to All Features
            </button>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#555A50]">
              <span className="font-mono text-[#1E221D] font-medium">
                {pageLabels[activePage]}
              </span>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={stopSpeech}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#B4233C] text-[#FCF9F4] font-semibold"
                >
                  <Square className="w-3 h-3" />
                  Stop Voice
                </button>
              )}
            </div>
          </div>
        )}

        {activePage === 'scan' && (
          <PrescriptionWorkspace
            language={language}
            userId={user?.uid ?? null}
            selectedPreset={selectedPreset}
            onLanguageChange={handleLanguageChange}
            onReportReady={handleReportReady}
            onSavedCheck={() => {
              if (user) void loadChecks(user.uid);
            }}
            onOpenMechanism={openMechanism}
            onOpenCellView={() => setActivePage('cell')}
            onOpenTestCases={() => setActivePage('test-cases')}
            onOpenFormulary={() => setActivePage('formulary')}
          />
        )}

        {activePage === 'test-cases' && (
          <TestCasesPage
            language={language}
            onSelectPreset={handleSelectTestCase}
            onOpenScanner={() => setActivePage('scan')}
          />
        )}

        {activePage === 'formulary' && (
          <MedicationDatabasePage
            language={language}
            onSelectPreset={handleSelectTestCase}
            onOpenMechanism={openMechanism}
            onOpenScanner={() => setActivePage('scan')}
          />
        )}

        {activePage === 'cell' && (
          <CellStructure3D
            language={language}
            highlightedMechanisms={highlightedMechanisms}
            onInspectMechanism={openMechanism}
          />
        )}

        {activePage === 'mechanism' && (
          <MechanismLens3D
            targetId={mechanismTarget}
            onSelectTarget={setMechanismTarget}
            language={language}
          />
        )}

        {activePage === 'facility' && <FacilityWatchlist />}

        {activePage === 'pharmacist' && (
          <PharmacistQueue onInspectMechanism={openMechanism} />
        )}
      </main>

      <footer className="border-t border-[#D5C8B4] py-4 px-5 text-xs text-[#555A50]">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            MedGuard · Prescription safety verification & 3D cellular mechanism explorer
          </span>
          {!user && (
            <button
              type="button"
              onClick={() => setGuestAccess(false)}
              className="text-[#556B22] font-semibold hover:underline"
            >
              Sign in to save checks
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
