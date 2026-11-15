import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Mail,
  PackageCheck,
  Plus,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type {
  FacilityStockItem,
  InventoryReconciliation,
  InventoryTransaction,
  LedgerMovementKind,
  OutboxNotification,
  RegulatorAlertRecord,
  ReverseMatchHit,
} from '../types/medguard.ts';

type FacilityTab = 'watchlist' | 'ledger' | 'outbox';

export function FacilityWatchlist() {
  const [activeTab, setActiveTab] = useState<FacilityTab>('watchlist');
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

  // Ledger state
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [reconciliation, setReconciliation] = useState<InventoryReconciliation | null>(null);
  const [moveKind, setMoveKind] = useState<LedgerMovementKind>('quarantine');
  const [moveQty, setMoveQty] = useState('5');
  const [moveNote, setMoveNote] = useState('');
  const [moveVerified, setMoveVerified] = useState(true);
  const [ledgerError, setLedgerError] = useState('');

  // Outbox state
  const [notifications, setNotifications] = useState<OutboxNotification[]>([]);
  const [outChannel, setOutChannel] = useState<'in_app' | 'email' | 'sms'>('in_app');
  const [outRecipient, setOutRecipient] = useState('dispensary-lead@medguard-clinic.org');
  const [outSubject, setOutSubject] = useState('');
  const [outBody, setOutBody] = useState('');
  const [outError, setOutError] = useState('');

  const loadLedger = useCallback(async (stockId: string) => {
    if (!stockId) return;
    try {
      const res = await fetch(`/api/facility/stock/${stockId}/transactions`);
      if (!res.ok) return;
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setReconciliation(data.reconciliation ?? null);
    } catch {
      // Ignore network error on initial load
    }
  }, []);

  const loadOutbox = useCallback(async () => {
    try {
      const res = await fetch('/api/facility/outbox');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Ignore network error
    }
  }, []);

  useEffect(() => {
    fetch('/api/facility/watchlist')
      .then((r) => r.json())
      .then((d) => {
        const list: FacilityStockItem[] = d.stock ?? [];
        setStock(list);
        setAlerts(d.alerts ?? []);
        if (d.alerts?.[0]?.id) setSelectedAlertId(d.alerts[0].id);
        if (list[0]?.id) {
          setSelectedStockId(list[0].id);
          void loadLedger(list[0].id);
        }
      })
      .catch(() => {});
    void loadOutbox();
  }, [loadLedger, loadOutbox]);

  useEffect(() => {
    if (selectedStockId) {
      void loadLedger(selectedStockId);
    }
  }, [selectedStockId, loadLedger]);

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

  const submitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setLedgerError('');
    if (!selectedStockId) return;
    const qty = Number(moveQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setLedgerError('Quantity delta must be greater than 0.');
      return;
    }
    const res = await fetch(`/api/facility/stock/${selectedStockId}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: moveKind,
        quantityDelta: qty,
        note: moveNote.trim() || `${moveKind} recorded in facility ledger`,
        verified: moveVerified,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLedgerError(data.error || 'Failed to record inventory movement.');
      return;
    }
    setTransactions(data.transactions ?? []);
    setReconciliation(data.reconciliation ?? null);
    if (data.stock) setStock(data.stock);
    setMoveNote('');
  };

  const queueNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setOutError('');
    if (!outRecipient.trim() || !outSubject.trim()) {
      setOutError('Recipient and subject are required.');
      return;
    }
    const res = await fetch('/api/facility/outbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: outChannel,
        recipient: outRecipient.trim(),
        subject: outSubject.trim(),
        body: outBody.trim() || outSubject.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setOutError(data.error || 'Unable to queue notification.');
      return;
    }
    setNotifications(data.notifications ?? []);
    setOutSubject('');
    setOutBody('');
  };

  const deliverPendingOutbox = async () => {
    const res = await fetch('/api/facility/outbox/deliver', { method: 'POST' });
    const data = await res.json();
    setNotifications(data.notifications ?? []);
  };

  const acknowledgeOutbox = async (id: string) => {
    const res = await fetch(`/api/facility/outbox/${id}/ack`, { method: 'PUT' });
    const data = await res.json();
    setNotifications(data.notifications ?? []);
  };

  return (
    <div className="space-y-6">
      <div className="organelle-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono text-[#3E7A3A]">FACILITY MODE · CLOSED-LOOP OPERATIONS</span>
            <h2 className="font-display text-xl font-semibold text-[#1E221D] mt-0.5">
              Pharmacy Stock Watchlist, Ledger & Recall Outbox
            </h2>
            <p className="text-xs text-[#555A50] mt-0.5">
              Reverse-screen held batches against CDSCO/WHO/FDA alerts, reconcile physical movements, and track durable recall notifications.
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
              onClick={() => {
                setActiveTab('watchlist');
                void runReverseMatch(selectedAlertId);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B8841E] hover:bg-[#9B6D14] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" />
              Trigger Reverse Match Recheck
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E4D9C7]">
          <button
            type="button"
            onClick={() => setActiveTab('watchlist')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'watchlist'
                ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5 text-[#3E7A3A]" />
            Stock Watchlist & Reverse-Match ({stock.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'ledger'
                ? 'bg-[#E9F1F9] border-[#29659B] text-[#1A4B7A]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-[#29659B]" />
            Inventory Ledger & Reconciliation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('outbox')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === 'outbox'
                ? 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D]'
                : 'bg-[#FCF9F4] border-[#D5C8B4] text-[#4F544C] hover:border-[#B8A68B]'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-[#B8841E]" />
            Recall Notification Outbox ({notifications.length})
          </button>
        </div>
      </div>

      {activeTab === 'watchlist' && (
        <>
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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStockId(h.stockItemId);
                            setMoveKind('quarantine');
                            setActiveTab('ledger');
                          }}
                          className="font-mono text-xs px-3 py-1.5 rounded bg-[#FCF9F4] border border-[#D5C8B4] text-[#8B152A] font-semibold hover:bg-[#EFE7DA]"
                        >
                          {h.matchTier === 'Confirmed' ? 'LOG QUARANTINE' : 'INSPECT LEDGER'}
                        </button>
                      </div>
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
                      <th className="px-3 py-2">Ledger</th>
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
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStockId(s.id);
                              setActiveTab('ledger');
                            }}
                            className="text-[11px] font-mono text-[#29659B] hover:underline font-semibold"
                          >
                            Reconcile
                          </button>
                        </td>
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
        </>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-5">
          <div className="organelle-panel rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#1E221D]">
                  Append-Only Inventory Ledger & Reconciliation
                </h3>
                <p className="text-xs text-[#555A50]">
                  Compares declared shelf pack count against verified vs unverified reported stock movements.
                </p>
              </div>
              <select
                value={selectedStockId}
                onChange={(e) => setSelectedStockId(e.target.value)}
                className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D] focus:outline-none focus:border-[#556B22]"
              >
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.productName} (Batch {s.batchNumber} · {s.quantityPacks} packs)
                  </option>
                ))}
              </select>
            </div>

            {reconciliation && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="organelle-subpanel rounded-lg p-3">
                  <div className="text-[11px] font-mono text-[#555A50]">Expected Record</div>
                  <div className="text-lg font-mono font-bold text-[#1E221D] mt-0.5">
                    {reconciliation.expectedQuantity}
                  </div>
                </div>
                <div className="organelle-subpanel rounded-lg p-3">
                  <div className="text-[11px] font-mono text-[#555A50]">Ledger Total</div>
                  <div className="text-lg font-mono font-bold text-[#29659B] mt-0.5">
                    {reconciliation.ledgerQuantity}
                  </div>
                </div>
                <div className="organelle-subpanel rounded-lg p-3">
                  <div className="text-[11px] font-mono text-[#555A50]">Matches Record</div>
                  <div
                    className={`text-lg font-mono font-bold mt-0.5 ${
                      reconciliation.matchesRecord ? 'text-[#245920]' : 'text-[#8B152A]'
                    }`}
                  >
                    {reconciliation.matchesRecord ? 'Yes' : 'No'}
                  </div>
                </div>
                <div className="organelle-subpanel rounded-lg p-3">
                  <div className="text-[11px] font-mono text-[#555A50]">Verified Moves</div>
                  <div className="text-lg font-mono font-bold text-[#245920] mt-0.5">
                    {reconciliation.verifiedMovements}
                  </div>
                </div>
                <div className="organelle-subpanel rounded-lg p-3">
                  <div className="text-[11px] font-mono text-[#555A50]">Unverified Moves</div>
                  <div
                    className={`text-lg font-mono font-bold mt-0.5 ${
                      reconciliation.reportedUnverifiedMovements > 0
                        ? 'text-[#875E0D]'
                        : 'text-[#1E221D]'
                    }`}
                  >
                    {reconciliation.reportedUnverifiedMovements}
                  </div>
                </div>
              </div>
            )}

            {reconciliation && !reconciliation.allVerified && (
              <div className="rounded-lg bg-[#FDF5E3] border border-[#E4C98C] p-3 text-xs text-[#6B4A08] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0" />
                <span>
                  Reported movements are pending independent verification and do not update shelf stock counts until physically verified.
                </span>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-5">
            <div className="organelle-panel rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-semibold text-[#1E221D]">
                Movement History ({transactions.length} entries)
              </h4>
              <div className="overflow-x-auto border border-[#D5C8B4] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#EFE7DA] text-[#4F544C] font-mono">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Kind</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Verification</th>
                      <th className="px-3 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4D9C7] bg-[#FCF9F4]">
                    {transactions.map((txn) => (
                      <tr key={txn.id}>
                        <td className="px-3 py-2 font-mono text-[11px] text-[#555A50] whitespace-nowrap">
                          {txn.at.slice(0, 10)}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-[#1E221D]">
                          {txn.kind}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#1E221D]">{txn.quantityDelta}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          {txn.verified ? (
                            <span className="text-[#245920] font-semibold">Verified</span>
                          ) : (
                            <span className="text-[#875E0D] font-semibold">Reported Only</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#3C4138]">
                          <div>{txn.note}</div>
                          <div className="text-[10px] font-mono text-[#555A50]">{txn.actor}</div>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-[#555A50]">
                          No ledger transactions recorded for this lot yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <form onSubmit={submitMovement} className="organelle-panel rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-semibold text-[#1E221D]">Record Stock Movement</h4>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-mono text-[#4F544C] mb-1">
                    Movement Kind
                  </label>
                  <select
                    value={moveKind}
                    onChange={(e) => setMoveKind(e.target.value as LedgerMovementKind)}
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs text-[#1E221D]"
                  >
                    <option value="quarantine">Quarantine (-)</option>
                    <option value="stock_in">Stock In (+)</option>
                    <option value="stock_out">Dispensed / Out (-)</option>
                    <option value="return">Supplier Return (+)</option>
                    <option value="record_correction">Record Correction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#4F544C] mb-1">
                    Quantity (packs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={moveQty}
                    onChange={(e) => setMoveQty(e.target.value)}
                    className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs font-mono text-[#1E221D]"
                  />
                </div>
              </div>
              <input
                value={moveNote}
                onChange={(e) => setMoveNote(e.target.value)}
                placeholder="Reason / physical bin reference"
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
              />
              <label className="flex items-start gap-2 text-xs text-[#3C4138] cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveVerified}
                  onChange={(e) => setMoveVerified(e.target.checked)}
                  className="mt-0.5 accent-[#556B22]"
                />
                <span>Physical count independently verified by pharmacist on duty</span>
              </label>
              {ledgerError && (
                <div className="text-xs text-[#8B152A] bg-[#FCEBEF] border border-[#E2A9B3] rounded-lg px-3 py-2">
                  {ledgerError}
                </div>
              )}
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#29659B] hover:bg-[#1F507D] text-[#FCF9F4] text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Append Ledger Entry
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'outbox' && (
        <div className="space-y-5">
          <div className="rounded-xl p-4 bg-[#FDF5E3] border border-[#E4C98C] text-xs text-[#6B4A08] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 max-w-2xl">
              <AlertTriangle className="w-4 h-4 text-[#B8841E] shrink-0" />
              <span>
                <strong>Operational Boundary:</strong> UI notification delivery & acknowledgement record communication receipt only; they are not proof of physical quarantine or batch removal.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void deliverPendingOutbox()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#556B22] hover:bg-[#46591B] text-[#FCF9F4] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              Deliver Pending Notifications
            </button>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-5">
            <div className="organelle-panel rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#1E221D]">
                Recall Outbox Queue ({notifications.length})
              </h3>
              <div className="space-y-3">
                {notifications.map((msg) => (
                  <div
                    key={msg.id}
                    className="organelle-subpanel rounded-lg p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#1E221D]">{msg.subject}</span>
                      <span
                        className={`font-mono text-[11px] px-2 py-0.5 rounded border font-semibold uppercase ${
                          msg.status === 'acknowledged'
                            ? 'bg-[#EAF5E9] border-[#B4D9B1] text-[#245920]'
                            : msg.status === 'delivered'
                              ? 'bg-[#E9F1F9] border-[#B3CDE5] text-[#1A4B7A]'
                              : 'bg-[#FDF5E3] border-[#E4C98C] text-[#875E0D]'
                        }`}
                      >
                        {msg.status}
                      </span>
                    </div>
                    <p className="text-[#3C4138] leading-relaxed">{msg.body}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-[#555A50]">
                      <span>
                        {msg.channel} → {msg.recipient} · Attempts: {msg.attempts}
                      </span>
                      {msg.status !== 'acknowledged' && (
                        <button
                          type="button"
                          onClick={() => void acknowledgeOutbox(msg.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#FCF9F4] border border-[#C6B69E] text-[#1E221D] hover:bg-[#EFE7DA] font-semibold"
                        >
                          <CheckCheck className="w-3 h-3 text-[#3E7A3A]" />
                          Acknowledge Receipt
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={queueNotification} className="organelle-panel rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#1E221D]">Queue Recall Notice</h3>
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={outChannel}
                  onChange={(e) => setOutChannel(e.target.value as 'in_app' | 'email' | 'sms')}
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs text-[#1E221D]"
                >
                  <option value="in_app">In-App Dispatch</option>
                  <option value="email">Email Alert</option>
                  <option value="sms">SMS Escalation</option>
                </select>
                <input
                  required
                  value={outRecipient}
                  onChange={(e) => setOutRecipient(e.target.value)}
                  placeholder="Recipient"
                  className="rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-2.5 py-2 text-xs text-[#1E221D]"
                />
              </div>
              <input
                required
                value={outSubject}
                onChange={(e) => setOutSubject(e.target.value)}
                placeholder="Subject (e.g., Quarantine Clarimac Batch MC26091A)"
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
              />
              <textarea
                rows={3}
                value={outBody}
                onChange={(e) => setOutBody(e.target.value)}
                placeholder="Instructions for dispensary team..."
                className="w-full rounded-lg bg-[#FCF9F4] border border-[#C6B69E] px-3 py-2 text-xs text-[#1E221D]"
              />
              {outError && (
                <div className="text-xs text-[#8B152A] bg-[#FCEBEF] border border-[#E2A9B3] rounded-lg px-3 py-2">
                  {outError}
                </div>
              )}
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#B8841E] hover:bg-[#9B6D14] text-[#FCF9F4] text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Queue Outbox Notification
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

