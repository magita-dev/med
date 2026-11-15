import { ArrowRight, FlaskConical, Play } from 'lucide-react';
import { SAMPLE_PRESETS } from '../data/medguardCatalog.ts';
import type { LanguageCode, SamplePreset } from '../types/medguard.ts';

interface TestCasesPageProps {
  language: LanguageCode;
  onSelectPreset: (preset: SamplePreset, autoVerify: boolean) => void;
  onOpenScanner: () => void;
}

export function TestCasesPage({
  language,
  onSelectPreset,
  onOpenScanner,
}: TestCasesPageProps) {
  return (
    <div className="space-y-6">
      <div className="organelle-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono text-[#BA5D33] font-semibold">
            <FlaskConical className="w-3.5 h-3.5" />
            <span>CLINICAL TEST CASES · LIVE SCENARIOS</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#1E221D]">
            {language === 'ta'
              ? 'மாதிரி மருந்துச்சீட்டு சோதனை வழக்குகள்'
              : language === 'hi'
                ? 'चिकित्सीय परीक्षण परिदृश्य (Test Cases)'
                : 'Clinical Test Cases & Safety Scenarios'}
          </h2>
          <p className="text-xs sm:text-sm text-[#4F544C] leading-relaxed">
            Select any scenario below to load its prescription lines, patient condition, and age directly into the Scan Here verifier.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenScanner}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#C6B69E] bg-[#EFE7DA] hover:bg-[#E5DAC7] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <span>Go to Scan Here</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {SAMPLE_PRESETS.map((preset, index) => {
          const isSafe = preset.id === 'safe-diabetes-lipid';
          return (
            <div
              key={preset.id}
              className="organelle-panel rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#555A50]">CASE 0{index + 1}</span>
                  <span
                    className={`font-semibold ${
                      isSafe ? 'text-[#245920]' : 'text-[#8E3E1C]'
                    }`}
                  >
                    {preset.patientCondition} · Age {preset.patientAge} yrs
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-[#1E221D]">
                    {preset.label}
                  </h3>
                  <p className="text-xs text-[#4F544C] mt-1">{preset.subtitle}</p>
                </div>

                <pre className="whitespace-pre-wrap font-mono text-xs text-[#2B3028] bg-[#EFE7DA] border border-[#D5C8B4] rounded-lg p-3 leading-relaxed">
                  {preset.rawPrescriptionText}
                </pre>

                <div className="space-y-1">
                  <div className="text-[11px] font-mono text-[#555A50]">
                    INCLUDED MEDICINES ({preset.items.length})
                  </div>
                  <div className="space-y-1 text-xs text-[#1E221D]">
                    {preset.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 bg-[#F5EFE5] border border-[#E4D9C7] rounded px-2.5 py-1.5"
                      >
                        <span className="font-medium truncate">
                          {item.brandName} ({item.activeIngredients.join(' + ')})
                        </span>
                        <span className="font-mono text-[#4F544C] shrink-0">
                          {item.totalDailyMg} mg/day
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E4D9C7] flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onSelectPreset(preset, true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run in Scan Here
                </button>
                <button
                  type="button"
                  onClick={() => onSelectPreset(preset, false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#C6B69E] bg-[#FCF9F4] hover:bg-[#EFE7DA] text-[#1E221D] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Edit Before Verify
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
