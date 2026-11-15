import { useState } from 'react';
import { ArrowRight, Languages, LogIn, ShieldCheck } from 'lucide-react';
import { signInWithGoogle } from '../firebase.ts';
import type { LanguageCode } from '../types/medguard.ts';

interface LoginPageProps {
  language: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onContinueGuest: () => void;
}

const COPY: Record<
  LanguageCode,
  {
    kicker: string;
    title: string;
    subtitle: string;
    cardHeading: string;
    cardBody: string;
    googleBtn: string;
    signingIn: string;
    guestBtn: string;
    captionHeading: string;
    captionBody: string;
    highlights: string[];
  }
> = {
  en: {
    kicker: 'CELLULAR PHARMACOLOGY · PRESCRIPTION VERIFIER',
    title: 'Sign in to explore prescriptions inside the living cell.',
    subtitle:
      'Audit daily dosages against regulatory limits, translate instructions into Tamil or Hindi, and inspect 3D organelle interactions.',
    cardHeading: 'Account Sign In',
    cardBody:
      'Sign in with Google to save verified prescription audits, sync your preferred language, and revisit your cellular reports.',
    googleBtn: 'Sign in with Google',
    signingIn: 'Opening Google Sign-In...',
    guestBtn: 'Continue to Workspace without signing in',
    captionHeading: 'Cellular Atlas Reference',
    captionBody:
      'Prescription compounds map directly onto cytoplasmic compartments—from endoplasmic reticulum CYP enzymes to mitochondrial complexes and membrane pores.',
    highlights: [
      'Real prescription photo reading & disease-age verification',
      'CDSCO, IAP & WHO pediatric daily limit warnings',
      'English, Tamil & Hindi voice explanations with 3D organelle views',
    ],
  },
  ta: {
    kicker: 'செல்லுலார் மருந்தியல் · மருந்துச்சீட்டு சரிபார்ப்பு',
    title: 'மருந்துகள் செல்லுக்குள் செயல்படும் விதத்தை அறிய உள்நுழையவும்.',
    subtitle:
      'தினசரி மருந்து அளவுகளை ஒழுங்குமுறை வரம்புகளுடன் சரிபார்த்து, தமிழ் வழிமுறைகளையும் 3D செல் உறுப்புகளையும் பார்க்கலாம்.',
    cardHeading: 'கணக்கு உள்நுழைவு',
    cardBody:
      'உங்கள் மருந்துச்சீட்டு சரிபார்ப்பு முடிவுகளைச் சேமிக்கவும் மொழி விருப்பத்தை ஒத்திசைக்கவும் Google மூலம் உள்நுழையவும்.',
    googleBtn: 'Google மூலம் உள்நுழையவும்',
    signingIn: 'Google உள்நுழைவு திறக்கிறது...',
    guestBtn: 'உள்நுழையாமல் பணியிடத்திற்குச் செல்லவும்',
    captionHeading: 'செல் அமைப்பு வழிகாட்டி',
    captionBody:
      'மருந்துகள் எண்டோபிளாஸ்மிக் ரெட்டிகுலம், மைட்டோகாண்ட்ரியா மற்றும் செல் சவ்வுத் துளைகளில் எவ்வாறு செயல்படுகின்றன என்பதை அறியலாம்.',
    highlights: [
      'மருந்துச்சீட்டுப் படத்தைப் படித்து நோய் & வயது பொருத்தத்தைச் சரிபார்க்கும் வசதி',
      'குழந்தைகள் மற்றும் பெரியவர்களுக்கான பாதுகாப்பான தினசரி அளவு எச்சரிக்கைகள்',
      'தமிழ் மற்றும் ஆங்கிலத்தில் குரல் விளக்கம் & 3D செல் அமைப்பு',
    ],
  },
  hi: {
    kicker: 'सेल्युलर फ़ार्माकोलॉजी · प्रिस्क्रिप्शन सत्यापन',
    title: 'जीवित कोशिका के भीतर दवाओं की सुरक्षा जांचने के लिए साइन इन करें।',
    subtitle:
      'दैनिक खुराक की सीमा, रोग मिलान, और तमिल या हिंदी में आवाज़ के साथ 3D कोशिका संरचना देखें।',
    cardHeading: 'खाता साइन इन',
    cardBody:
      'अपने सत्यापित प्रिस्क्रिप्शन रिकॉर्ड सहेजने और भाषा प्राथमिकता सिंक करने के लिए Google से साइन इन करें।',
    googleBtn: 'Google से साइन इन करें',
    signingIn: 'Google साइन-इन खुल रहा है...',
    guestBtn: 'बिना साइन इन किए कार्यक्षेत्र खोलें',
    captionHeading: 'कोशिकीय संरचना मानचित्र',
    captionBody:
      'दवाइयाँ एंडोप्लाज्मिक रेटिकुलम, माइटोकॉन्ड्रिया और प्लाज्मा झिल्ली चैनलों पर कैसे कार्य करती हैं, इसे 3D में देखें।',
    highlights: [
      'प्रिस्क्रिप्शन फोटो स्कैन व रोग-आयु मिलान सत्यापन',
      'CDSCO, IAP व WHO बाल चिकित्सा खुराक सुरक्षा चेतावनी',
      'अंग्रेजी, तमिल और हिंदी में ध्वनि व्याख्या एवं 3D दृश्य',
    ],
  },
};

export function LoginPage({
  language,
  onLanguageChange,
  onContinueGuest,
}: LoginPageProps) {
  const t = COPY[language];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to complete Google Sign-In.';
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        setError('Sign-in window was closed before completing login. Please try again.');
      } else if (
        code === 'auth/unauthorized-domain' ||
        msg.includes('unauthorized-domain')
      ) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setError(
          `Domain "${host}" is not authorized in Firebase Authentication yet. Add "${host}" in Firebase Console → Authentication → Settings → Authorized domains, or continue without signing in below.`
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen cellular-canvas text-[#1E221D] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-[#D5C8B4] bg-[#FAF6EE]/95">
        <div className="max-w-[1280px] mx-auto px-5 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight text-[#1E221D] whitespace-nowrap shrink-0">
            MedGuard
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#555A50]">
            <span className="whitespace-nowrap shrink-0">Prescription Audit</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap shrink-0">Cell Atlas</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap shrink-0">AlphaFold 3D</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap shrink-0">Tamil & English Voice</span>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onContinueGuest}
              className="px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#F1E8DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Open Workspace
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-5 py-8 lg:py-12 flex items-center">
        <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.9fr)] gap-7 items-stretch w-full">
          {/* Left Editorial Cellular Plate */}
          <section className="organelle-panel rounded-xl p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#556B22]">
                <span>{t.kicker}</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E221D] leading-tight tracking-tight text-balance">
                {t.title}
              </h1>
              <p className="text-sm sm:text-base text-[#4F544C] leading-relaxed max-w-2xl">
                {t.subtitle}
              </p>
            </div>

            <div className="rounded-lg border border-[#D5C8B4] bg-[#EFE7DA] overflow-hidden">
              {!imgError ? (
                <img
                  src="/assets/aistudio/image_8c627060.png"
                  alt="Editorial cross-section diagram of a eukaryotic cell showing nucleus, endoplasmic reticulum, Golgi apparatus, mitochondria, and membrane structures"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full max-h-[340px] object-cover object-center"
                />
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#F2EAD8] via-[#E5DEC9] to-[#DCE4CA]">
                  <ShieldCheck className="w-10 h-10 text-[#556B22] mb-2" />
                  <p className="font-display text-lg font-semibold text-[#1E221D]">
                    Cellular Mechanism Reference Plate
                  </p>
                </div>
              )}
              <div className="px-4 py-3 bg-[#FCF9F4] border-t border-[#D5C8B4] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#1E221D]">{t.captionHeading}</span>
                <span className="text-[#555A50] font-mono">
                  Nucleus · Endoplasmic Reticulum · Golgi · Mitochondria
                </span>
              </div>
            </div>

            <p className="text-xs text-[#555A50] leading-relaxed">{t.captionBody}</p>
          </section>

          {/* Right Sign-In Column */}
          <section className="organelle-panel rounded-xl p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-[#74559C]">MEDGUARD ACCOUNT</span>
                  <h2 className="font-display text-2xl font-bold text-[#1E221D] mt-0.5">
                    {t.cardHeading}
                  </h2>
                </div>

                <div className="flex items-center gap-1 bg-[#EFE7DA] border border-[#D5C8B4] rounded-lg p-1">
                  <Languages className="w-3.5 h-3.5 text-[#556B22] ml-1.5" />
                  {(['en', 'ta', 'hi'] as LanguageCode[]).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => onLanguageChange(code)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        language === code
                          ? 'bg-[#556B22] text-[#FCF9F4] font-semibold'
                          : 'text-[#4F544C] hover:text-[#1E221D]'
                      }`}
                    >
                      {code === 'en' ? 'EN' : code === 'ta' ? 'தமிழ்' : 'हिन्दी'}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-sm text-[#4F544C] leading-relaxed">{t.cardBody}</p>

              {/* Organelle Color Keyed Highlights */}
              <div className="organelle-subpanel rounded-lg p-4 space-y-2.5 text-xs text-[#2B3028]">
                <div className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#556B22] mt-1 shrink-0" />
                  <span>{t.highlights[0]}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#BA5D33] mt-1 shrink-0" />
                  <span>{t.highlights[1]}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#29659B] mt-1 shrink-0" />
                  <span>{t.highlights[2]}</span>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#E2A9B3] bg-[#FCEBEF] px-3.5 py-2.5 text-xs text-[#8B152A]"
                >
                  {error}
                </div>
              )}

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleGoogleLogin()}
                  className="w-full inline-flex items-center justify-center gap-2.5 py-3 px-4 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  <LogIn className="w-4 h-4" />
                  {busy ? t.signingIn : t.googleBtn}
                </button>

                <button
                  type="button"
                  onClick={onContinueGuest}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors"
                >
                  <span>{t.guestBtn}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#D5C8B4] text-xs text-[#61665B] flex flex-wrap items-center justify-between gap-2">
              <span>Google Authentication · Private History</span>
              <span className="font-mono">EN · தமிழ் · हिन्दी</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
