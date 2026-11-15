import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, PackageCheck, Plus, ShieldAlert } from 'lucide-react';
import type {
  FacilityStockItem,
  RegulatorAlertRecord,
  ReverseMatchHit,
} from '../types/medguard.ts';

export function FacilityWatchlist() {
  const [stock, setStock] = useState<FacilityStockItem[]>([]);
  const [alerts, setAlerts] = useState<RegulatorAlertRecord[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string>('');
  const [hits, setHits] = useState<ReverseMatchHit[] | null>(null);
  const [checkedMeta, setCheckedMeta] = useState<{
    alert: RegulatorAlertRecord;
    checkedCount: number;
    checkedAt: string;
  } | null>(null);

  const [newProduct, setNewProduct] = useState('');
  const [newIngredients, setNewIngredients] = useState('');
  const [newBatch, setNewBatch] = useState('');
  const [newMfg, setNewMfg] = useState('');
  const [newQty, setNewQty] = useState('25');
  const [newShelf, setNewShelf] = useState('Rack D-04');

  useEffect(() => {
    fetch('/api/facility/watchlist')
      .then((r) => r.json())
      .then((d) => {
        setStock(d.stock ?? []);
        setAlerts(d.alerts ?? []);
        if (d.alerts?.[0]?.id) setSelectedAlertId(d.alerts[0].id);
      })
      .catch(() => {});
  }, []);

  const addStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.trim() || !newBatch.trim()) return;
    const res = await fetch('/api/facility/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: newProduct.trim(),
        activeIngredients: newIngredients
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
        batchNumber: newBatch.trim(),
        manufacturer: newMfg.trim() || 'Unspecified',
        quantityPacks: Number(newQty) || 10,
        shelfLocation: newShelf.trim() || 'Main Shelf',
      }),
    });
    const data = await res.json();
    setStock(data.stock ?? []);
    setNewProduct('');
    setNewIngredients('');
    setNewBatch('');
    setNewMfg('');
  };

  const runReverseMatch = async (alertId: string) => {
    const res = await fetch('/api/facility/reverse-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    });
    const data = await res.json();
    setHits(data.hits ?? []);
    setCheckedMeta({
      alert: data.alert,
      checkedCount: data.checkedCount,
      checkedAt: data.checkedAt,
    });
    const listRes = await fetch('/api/facility/watchlist');
    const listData = await listRes.json();
    setStock(listData.stock ?? []);
  };

  return (
    <div className="space-y-6">
      <div className="organelle-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-[#3E7A3A]">FACILITY MODE · REVERSE MATCHING</span>
          <h2 className="font-display text-xl font-semibold text-[#1E221D] mt-0.5">
            Pharmacy Stock Watchlist & Recall Traceback
          </h2>
          <p className="text-xs text-[#555A50] mt-0.5">
            Every incoming CDSCO / WHO / FDA alert automatically re-screens held batches for Confirmed or Same-Product recalls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedAlertId}
            onChange={(e) => setSelectedAlertId(e.target.value)}
            className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] focus:outline-none focus:border-[#556B22]"
          >
            {alerts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.agency}: {a.productName} ({a.batchNumbers.join(', ')})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void runReverseMatch(selectedAlertId)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B8841E] hover:bg-[#9B6D14] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <BellRing className="w-3.5 h-3.5" />
            Trigger Reverse Match Recheck
          </button>
        </div>
      </div>

      {checkedMeta && hits && (
        <div className="organelle-panel rounded-xl p-5 space-y-3 border-[#DEC595]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#1E221D]">
              Reverse-Match Sweep Result: {checkedMeta.alert.id} ({checkedMeta.alert.agency})
            </h3>
            <span className="text-xs font-mono text-[#555A50]">
              Screened {checkedMeta.checkedCount} stock lots · {checkedMeta.checkedAt}
            </span>
          </div>

          {hits.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-[#245920] bg-[#EAF5E9] border border-[#B4D9B1] rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                No matching products or batches held in facility inventory for alert {checkedMeta.alert.id} as of {checkedMeta.checkedAt}.
              </span>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {hits.map((h) => (
                <div
                  key={h.stockItemId}
                  className={`rounded-lg p-3.5 border flex flex-wrap items-center justify-between gap-3 text-xs ${
                    h.matchTier === 'Confirmed'
                      ? 'bg-[#FCEBEF] border-[#E2A9B3]'
                      : 'bg-[#FDF5E3] border-[#E4C98C]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-sm text-[#1E221D]">
                      <ShieldAlert className="w-4 h-4 text-[#B4233C]" />
                      <span>
                        {h.productName} · Batch {h.batchNumber}
                      </span>
                    </div>
                    <p className="text-[#3C4138]">{h.reason}</p>
                    <div className="font-mono text-[11px] text-[#555A50]">
                      Shelf: {h.shelfLocation} · {h.quantityPacks} packs impacted · Match tier: {h.matchTier}
                    </div>
                  </div>
                  <span className="font-mono text-xs px-3 py-1.5 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[#8B152A] font-semibold">
                    {h.matchTier === 'Confirmed' ? 'QUARANTINE LOT' : 'INSPECT BATCH'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-5">
        <div className="organelle-panel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[#29659B]" />
            <h3 className="text-sm font-semibold text-[#1E221D]">
              Held Pharmacy Inventory ({stock.length} lots)
            </h3>
          </div>
          <div className="overflow-x-auto border border-[#D5C8B4] rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EFE7DA] text-[#4F544C] font-mono">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Batch #</th>
                  <th className="px-3 py-2">Shelf</th>
                  <th className="px-3 py-2">Packs</th>
                  <th className="px-3 py-2">Last Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4D9C7] bg-[#FCF9F4]">
                {stock.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-[#1E221D]">{s.productName}</div>
                      <div className="font-mono text-[11px] text-[#29659B]">
                        {s.activeIngredients.join(', ')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[#1E221D]">{s.batchNumber}</td>
                    <td className="px-3 py-2.5 text-[#4F544C]">{s.shelfLocation}</td>
                    <td className="px-3 py-2.5 font-mono text-[#1E221D]">{s.quantityPacks}</td>
                    <td className="px-3 py-2.5 font-mono text-[#555A50]">{s.lastCheckedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={addStock} className="organelle-panel rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#1E221D]">Register Stock Lot to Watchlist</h3>
          <input
            required
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            placeholder="Product name (e.g., Clarimac-250)"
            className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] focus:outline-none focus:border-[#556B22]"
          />
          <input
            required
            value={newIngredients}
            onChange={(e) => setNewIngredients(e.target.value)}
            placeholder="Active ingredients (comma separated)"
            className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] font-mono focus:outline-none focus:border-[#556B22]"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              required
              value={newBatch}
              onChange={(e) => setNewBatch(e.target.value)}
              placeholder="Batch # (e.g. MC26091A)"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] font-mono focus:outline-none focus:border-[#556B22]"
            />
            <input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Packs"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] font-mono focus:outline-none focus:border-[#556B22]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              value={newMfg}
              onChange={(e) => setNewMfg(e.target.value)}
              placeholder="Manufacturer"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] focus:outline-none focus:border-[#556B22]"
            />
            <input
              value={newShelf}
              onChange={(e) => setNewShelf(e.target.value)}
              placeholder="Shelf location"
              className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] focus:outline-none focus:border-[#556B22]"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lot to Watchlist
          </button>
        </form>
      </div>
    </div>
  );
}
