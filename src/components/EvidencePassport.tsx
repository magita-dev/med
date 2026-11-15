import { AlertTriangle, CheckCircle2, ExternalLink, FileCheck2, ShieldAlert } from 'lucide-react';
import type { LanguageCode, PackCheckResult } from '../types/medguard.ts';

interface EvidencePassportProps {
  packCheck: PackCheckResult;
  language: LanguageCode;
}

const KIND_LABELS: Record<NonNullable<PackCheckResult['kind']>, string> = {
  nsq: 'Not of Standard Quality (NSQ)',
  recall: 'Product Recall',
  spurious: 'Spurious / Falsified Alert',
  prohibition: 'Gazette Prohibition',
};

export function EvidencePassport({ packCheck, language }: EvidencePassportProps) {
  const isConfirmed = packCheck.tier === 'Confirmed';
  const isSameProduct = packCheck.tier === 'Same product, different batch';

  const statusTone = isConfirmed
    ? 'bg-[#FCEBEF] border-[#E2A9B3] text-[#8B152A]'
    : isSameProduct
      ? 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D]'
      : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#3C4138]';

  const statusHeading = isConfirmed
    ? language === 'ta'
      ? `உறுதிப்படுத்தப்பட்ட தொகுதி எச்சரிக்கை (${packCheck.agency ?? 'Regulator'} ${packCheck.alertId ?? ''})`
      : `Confirmed Batch Alert (${packCheck.agency ?? 'Regulator'} ${packCheck.alertId ?? ''})`
    : isSameProduct
      ? language === 'ta'
        ? `ஒரே மருந்து, வேறு தொகுதி எண் (${packCheck.agency ?? 'Regulator'} ${packCheck.alertId ?? ''})`
        : `Same product, different batch (${packCheck.agency ?? 'Regulator'} ${packCheck.alertId ?? ''})`
      : language === 'ta'
        ? `${packCheck.asOfDate} நிலவரப்படி எச்சரிக்கை பட்டியலில் இல்லை`
        : `Not found in loaded alerts as of ${packCheck.asOfDate}`;

  return (
    <div className={`rounded-xl p-4 border space-y-3 text-xs ${statusTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">EVIDENCE PASSPORT</span>
            <span aria-hidden="true">·</span>
            <span>{packCheck.evidenceTier} Tier</span>
            {packCheck.kind && (
              <>
                <span aria-hidden="true">·</span>
                <span>{KIND_LABELS[packCheck.kind]}</span>
              </>
            )}
          </div>
          <div className="text-sm font-semibold text-[#1E221D]">{packCheck.productName}</div>
        </div>

        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded bg-[#FCF9F4] border border-[#D5C8B4] font-semibold">
          {isConfirmed ? (
            <ShieldAlert className="w-3.5 h-3.5 text-[#B4233C]" />
          ) : isSameProduct ? (
            <AlertTriangle className="w-3.5 h-3.5 text-[#B8841E]" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7A3A]" />
          )}
          <span>{statusHeading}</span>
        </span>
      </div>

      {packCheck.reason && (
        <p className="text-xs text-[#2B3028] leading-relaxed bg-[#FCF9F4]/80 border border-[#D5C8B4] rounded-lg px-3 py-2">
          {packCheck.reason}
        </p>
      )}

      {/* Criterion-by-Criterion Match Matrix */}
      <div className="overflow-x-auto rounded-lg border border-[#D5C8B4] bg-[#FCF9F4]">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#EFE7DA] text-[#4F544C] font-mono">
            <tr>
              <th className="px-2.5 py-1.5">Criterion</th>
              <th className="px-2.5 py-1.5">Entered on Prescription</th>
              <th className="px-2.5 py-1.5">Recorded in Notice</th>
              <th className="px-2.5 py-1.5">Match</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4D9C7] text-[#1E221D]">
            <tr>
              <td className="px-2.5 py-1.5 font-medium">Product</td>
              <td className="px-2.5 py-1.5 font-mono">{packCheck.productName || '—'}</td>
              <td className="px-2.5 py-1.5 font-mono">
                {packCheck.noticeValues?.productName || 'No matching notice'}
              </td>
              <td className="px-2.5 py-1.5 font-mono font-semibold">
                {packCheck.criteria.productMatch ? 'Yes' : 'No'}
              </td>
            </tr>
            <tr>
              <td className="px-2.5 py-1.5 font-medium">Manufacturer</td>
              <td className="px-2.5 py-1.5 font-mono">{packCheck.manufacturer || 'Unspecified'}</td>
              <td className="px-2.5 py-1.5 font-mono">
                {packCheck.noticeValues?.manufacturer || '—'}
              </td>
              <td className="px-2.5 py-1.5 font-mono font-semibold">
                {packCheck.criteria.manufacturerMatch ? 'Yes' : 'No'}
              </td>
            </tr>
            <tr>
              <td className="px-2.5 py-1.5 font-medium">Batch #</td>
              <td className="px-2.5 py-1.5 font-mono">{packCheck.batchNumber || 'Not entered'}</td>
              <td className="px-2.5 py-1.5 font-mono">
                {packCheck.noticeValues?.batchNumber || '—'}
              </td>
              <td className="px-2.5 py-1.5 font-mono font-semibold">
                {packCheck.criteria.batchMatch ? 'Yes' : 'No'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Provenance & Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#4F544C]">
        <div className="flex flex-wrap items-center gap-3">
          {packCheck.locator && <span>Locator: {packCheck.locator}</span>}
          {packCheck.publishedDate && <span>Published: {packCheck.publishedDate}</span>}
          {packCheck.reviewedAt && <span>Reviewed: {packCheck.reviewedAt}</span>}
        </div>
        {packCheck.sourceUrl && (
          <a
            href={packCheck.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#29659B] hover:underline font-semibold"
          >
            <span>Source notice</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Verification & Cryptographic Fingerprint */}
      {(packCheck.verification || packCheck.sha256) && (
        <div className="flex flex-wrap gap-3 text-[11px] text-[#4F544C]">
          {packCheck.verification && (
            <details className="bg-[#FCF9F4] border border-[#D5C8B4] rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px]">
              <summary className="cursor-pointer font-mono font-semibold text-[#1E221D]">
                What was verified
              </summary>
              <div className="mt-1.5 space-y-0.5 font-mono text-[10px]">
                <div>Source bytes: {packCheck.verification.sourceBytes}</div>
                <div>Transcription: {packCheck.verification.transcription}</div>
                <div>Scope: {packCheck.verification.scope}</div>
              </div>
            </details>
          )}
          {packCheck.sha256 && (
            <details className="bg-[#FCF9F4] border border-[#D5C8B4] rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px]">
              <summary className="cursor-pointer font-mono font-semibold text-[#1E221D]">
                Evidence fingerprint (SHA-256)
              </summary>
              <code className="block mt-1.5 font-mono text-[10px] break-all text-[#29659B]">
                {packCheck.sha256}
              </code>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
