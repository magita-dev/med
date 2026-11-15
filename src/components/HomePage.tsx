import {
  ArrowRight,
  Bookmark,
  ClipboardList,
  Database,
  Dna,
  FlaskConical,
  Microscope,
  PackageSearch,
  ScanLine,
  Trash2,
} from 'lucide-react';
import type { SavedCheckRecord } from '../firebase.ts';
import type { LanguageCode, MechanismTargetId } from '../types/medguard.ts';

export type AppPage =
  | 'home'
  | 'scan'
  | 'test-cases'
  | 'formulary'
  | 'cell'
  | 'mechanism'
  | 'facility'
  | 'pharmacist';

interface HomePageProps {
  language: LanguageCode;
  userId?: string | null;
  savedChecks: SavedCheckRecord[];
  checksLoading: boolean;
  onSelectPage: (page: AppPage) => void;
  onOpenMechanism: (targetId: MechanismTargetId) => void;
  onDeleteSavedCheck: (checkId: string) => void;
}

interface FeatureOption {
  id: AppPage;
  title: Record<LanguageCode, string>;
  category: string;
  description: Record<LanguageCode, string>;
  actionLabel: Record<LanguageCode, string>;
  accentHex: string;
  icon: typeof ScanLine;
}

const FEATURE_OPTIONS: FeatureOption[] = [
  {
    id: 'scan',
    title: {
      en: 'Scan Here',
      ta: 'இங்கே ஸ்கேன் செய்யவும்',
      hi: 'यहाँ स्कैन करें',
    },
    category: 'PRESCRIPTION UPLOAD & AUDIT',
    description: {
      en: 'Upload a prescription or tablet strip photo, verify disease and age match, detect daily dosage warnings, and hear explanations.',
      ta: 'மருந்துச்சீட்டுப் படத்தைப் பதிவேற்றி நோய், வயது மற்றும் தினசரி அளவு பாதுகாப்பைச் சரிபார்க்கவும்.',
      hi: 'प्रिस्क्रिप्शन फोटो अपलोड करें, रोग व आयु मिलान जाँचें और सुरक्षित खुराक चेतावनी देखें।',
    },
    actionLabel: {
      en: 'Open Scanner',
      ta: 'ஸ்கேனர் திற',
      hi: 'स्कैनर खोलें',
    },
    accentHex: '#556B22',
    icon: ScanLine,
  },
  {
    id: 'test-cases',
    title: {
      en: 'Test Cases',
      ta: 'மாதிரி சோதனைகள்',
      hi: 'टेस्ट केस',
    },
    category: 'CLINICAL SCENARIO SUITE',
    description: {
      en: 'Run curated presets for safe regimens, CYP3A4 clashes, overdose limits, CDSCO banned FDCs, and pediatric weight warnings.',
      ta: 'பாதுகாப்பான மருந்துகள், அதிக அளவு மற்றும் குழந்தைகள் பாதுகாப்பு மாதிரிகளைச் சோதிக்கவும்.',
      hi: 'सुरक्षित नियम, CYP3A4 टकराव, ओवरडोज़ और बाल चिकित्सा केस चलाकर देखें।',
    },
    actionLabel: {
      en: 'Browse Test Cases',
      ta: 'சோதனைகளைப் பார்',
      hi: 'केस देखें',
    },
    accentHex: '#BA5D33',
    icon: FlaskConical,
  },
  {
    id: 'formulary',
    title: {
      en: 'Pediatric RAG DB',
      ta: 'குழந்தைகள் மருந்து RAG தொகுப்பு',
      hi: 'बाल चिकित्सा RAG डेटाबेस',
    },
    category: 'CDSCO · IAP · WHO FORMULARY',
    description: {
      en: 'Search all 15 pediatric medication RAG monographs, calculate child weight-based doses, check contraindications, and test records in Scan Here.',
      ta: 'குழந்தைகள் மருந்து அளவுகள், எடை கணக்கீடு மற்றும் CDSCO/WHO எச்சரிக்கைகளைப் பார்க்கவும்.',
      hi: 'सभी 15 बाल चिकित्सा RAG प्रविष्टियाँ खोजें, वजन-आधारित खुराक गणना करें और स्कैनर में चलाएँ।',
    },
    actionLabel: {
      en: 'Explore RAG Database',
      ta: 'தொகுப்பைப் பார்',
      hi: 'डेटाबेस देखें',
    },
    accentHex: '#3E7A3A',
    icon: Database,
  },
  {
    id: 'cell',
    title: {
      en: 'Cell Structure 3D',
      ta: 'செல்லின் 3D அமைப்பு',
      hi: 'कोशिका 3D संरचना',
    },
    category: 'ORGANELLE CUTAWAY ATLAS',
    description: {
      en: 'Orbit a 3D eukaryotic cell cross-section and inspect where medicines act inside the ER, mitochondria, Golgi, and membrane.',
      ta: 'செல்லின் உள் உறுப்புகளில் மருந்துகள் எங்கு செயல்படுகின்றன என்பதை 3D-யில் பார்க்கவும்.',
      hi: '3D कोशिका के भीतर ER, माइटोकॉन्ड्रिया और झिल्ली पर दवाओं का प्रभाव देखें।',
    },
    actionLabel: {
      en: 'Explore Cell 3D',
      ta: '3D செல்லைத் திற',
      hi: '3D कोशिका देखें',
    },
    accentHex: '#74559C',
    icon: Dna,
  },
  {
    id: 'mechanism',
    title: {
      en: 'AlphaFold 3D',
      ta: 'AlphaFold 3D புரதம்',
      hi: 'AlphaFold 3D तंत्र',
    },
    category: 'MOLECULAR POCKET LENS',
    description: {
      en: 'Inspect PDB and AlphaFold protein pockets (CYP3A4, hERG, AMPK, COX-2) to visualize inhibitor clashes vs normal substrates.',
      ta: 'புரதப் பாக்கெட் அமைப்புகளையும் மருந்து மோதல்களையும் 3D-யில் ஆராயவும்.',
      hi: 'CYP3A4, hERG, AMPK और COX-2 प्रोटीन पॉकेट में दवा टकराव देखें।',
    },
    actionLabel: {
      en: 'Inspect Proteins',
      ta: 'புரதங்களைப் பார்',
      hi: 'प्रोटीन देखें',
    },
    accentHex: '#29659B',
    icon: Microscope,
  },
  {
    id: 'facility',
    title: {
      en: 'Facility Watchlist',
      ta: 'மருந்தக இருப்புப் பட்டியல்',
      hi: 'फ़ार्मेसी स्टॉक वॉचलिस्ट',
    },
    category: 'BATCH RECALL TRACEBACK',
    description: {
      en: 'Manage held pharmacy stock batches and run reverse-match sweeps against incoming CDSCO, WHO, and FDA safety alerts.',
      ta: 'மருந்தக இருப்பு தொகுப்புகளை ஒழுங்குமுறை எச்சரிக்கைகளுடன் ஒப்பிட்டுச் சரிபார்க்கவும்.',
      hi: 'स्टॉक बैच प्रबंधित करें और CDSCO/WHO/FDA अलर्ट के विरुद्ध जांच चलाएँ।',
    },
    actionLabel: {
      en: 'Open Watchlist',
      ta: 'பட்டியலைத் திற',
      hi: 'वॉचलिस्ट खोलें',
    },
    accentHex: '#B8841E',
    icon: PackageSearch,
  },
  {
    id: 'pharmacist',
    title: {
      en: 'Pharmacist Queue',
      ta: 'மருந்தாளர் மதிப்பாய்வு',
      hi: 'फ़ार्मासिस्ट कतार',
    },
    category: 'CLINICAL GOVERNANCE TRIAGE',
    description: {
      en: 'Review unverified structural protein hypotheses routed for clinical pharmacist escalation or dismissal.',
      ta: 'மருந்தாளர் மதிப்பாய்விற்கான புரதக் கட்டமைப்பு கருதுகோள்களை நிர்வகிக்கவும்.',
      hi: 'फ़ार्मासिस्ट समीक्षा के लिए भेजी गई संरचनात्मक परिकल्पनाओं का मूल्यांकन करें।',
    },
    actionLabel: {
      en: 'Open Queue',
      ta: 'வரிசையைத் திற',
      hi: 'कतार खोलें',
    },
    accentHex: '#3E7A3A',
    icon: ClipboardList,
  },
];

export function HomePage({
  language,
  userId,
  savedChecks,
  checksLoading,
  onSelectPage,
  onOpenMechanism,
  onDeleteSavedCheck,
}: HomePageProps) {
  return (
    <div className="space-y-6">
      {/* Main Feature Directory */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="text-xs font-mono text-[#556B22] font-semibold">
              WORKSPACE DIRECTORY
            </span>
            <h2 className="font-display text-2xl font-bold text-[#1E221D]">
              {language === 'ta'
                ? 'அனைத்து அம்சங்களையும் தேர்ந்தெடுக்கவும்'
                : language === 'hi'
                  ? 'सभी सुविधाएँ चुनें'
                  : 'Select a MedGuard Feature'}
            </h2>
          </div>
          <span className="text-xs text-[#555A50]">
            Choose any module below to open its dedicated workspace page.
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURE_OPTIONS.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => onSelectPage(feature.id)}
                className="organelle-panel rounded-xl p-5 text-left flex flex-col justify-between gap-4 hover:border-[#637928] hover:bg-[#F7F2E7] transition-colors group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#555A50]">
                      {feature.category}
                    </span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-[#D5C8B4]"
                      style={{ backgroundColor: '#EFE7DA', color: feature.accentHex }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-[#1E221D]">
                    {feature.title[language]}
                  </h3>

                  <p className="text-xs text-[#4F544C] leading-relaxed">
                    {feature.description[language]}
                  </p>
                </div>

                <div
                  className="pt-3 border-t border-[#E4D9C7] flex items-center justify-between text-xs font-semibold"
                  style={{ color: feature.accentHex }}
                >
                  <span>{feature.actionLabel[language]}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Signed-in User Saved Checks */}
      {userId && (
        <section className="organelle-panel rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#74559C]" />
              <h3 className="font-display text-base font-semibold text-[#1E221D]">
                Saved Prescription Checks
              </h3>
            </div>
            <span className="text-xs font-mono text-[#555A50]">
              {checksLoading ? 'Loading...' : `${savedChecks.length} saved`}
            </span>
          </div>

          {savedChecks.length === 0 ? (
            <p className="text-xs text-[#555A50]">
              Open &ldquo;Scan Here&rdquo;, verify a prescription, and click &ldquo;Save Check&rdquo; to keep a record in your account.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedChecks.map((item) => (
                <div
                  key={item.id}
                  className="organelle-subpanel rounded-lg p-3.5 text-xs space-y-1.5 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span
                        className={`font-semibold ${
                          item.verdict === 'SAFE_TO_TAKE'
                            ? 'text-[#245920]'
                            : item.verdict === 'CAUTION_REVIEW'
                              ? 'text-[#875E0D]'
                              : 'text-[#8B152A]'
                        }`}
                      >
                        {item.verdict}
                      </span>
                      <span className="text-[#555A50]">{item.createdAtLabel}</span>
                    </div>
                    <div className="font-semibold text-[#1E221D]">
                      {item.patientCondition} · {item.patientAge} yrs
                    </div>
                    <div className="text-[#4F544C] line-clamp-2">{item.medicineSummary}</div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#DCD0BD]">
                    <button
                      type="button"
                      onClick={() => onOpenMechanism(item.primaryMechanismId)}
                      className="text-[#29659B] font-semibold hover:underline"
                    >
                      3D {item.primaryMechanismId}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedCheck(item.id)}
                      className="text-[#6C6F66] hover:text-[#B4233C]"
                      title="Delete saved check"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
