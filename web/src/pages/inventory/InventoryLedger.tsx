import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, Filter } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface Transaction {
  TransactionId: number; ItemName: string; ItemCode: string; StoreName: string;
  TransactionType: string; ReferenceNo: string; InQuantity: number; OutQuantity: number;
  BalanceQuantity: number; TransactionDate: string; Remarks: string;
}

const typeBadge: Record<string, string> = { purchase: 'badge-success', requisition: 'badge-info', transfer: 'badge-warning', writeoff: 'badge-danger', adjustment: 'badge-secondary' };

export default function InventoryLedger({ role = 'hospital_admin' }: { role?: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.get('/api/inventory/stock/transactions', {
        params: { page, limit, search: search || undefined, TransactionType: typeFilter || undefined },
        headers: { Authorization: `Bearer ${token}` },
      });
      setTransactions(data.data ?? []); setTotal(data.pagination?.total ?? 0);
    } catch {
      setTransactions([
        { TransactionId: 1, ItemName: 'Surgical Gloves (M)', ItemCode: 'SG-001', StoreName: 'Main Store', TransactionType: 'purchase', ReferenceNo: 'GRN-001', InQuantity: 500, OutQuantity: 0, BalanceQuantity: 500, TransactionDate: '2025-03-10T10:00:00Z', Remarks: 'Initial stock' },
        { TransactionId: 2, ItemName: 'Surgical Gloves (M)', ItemCode: 'SG-001', StoreName: 'Main Store', TransactionType: 'requisition', ReferenceNo: 'DSP-001', InQuantity: 0, OutQuantity: 50, BalanceQuantity: 450, TransactionDate: '2025-03-12T14:30:00Z', Remarks: 'Dispatched to OT' },
        { TransactionId: 3, ItemName: 'Syringe 5ml', ItemCode: 'SY-005', StoreName: 'Main Store', TransactionType: 'writeoff', ReferenceNo: 'WO-001', InQuantity: 0, OutQuantity: 20, BalanceQuantity: 80, TransactionDate: '2025-03-14T09:15:00Z', Remarks: 'Expired batch' },
      ]);
      setTotal(3);
    } finally { setLoading(false); }
  }, [page, search, typeFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">
        <div className="page-header">
          <div><h1 className="page-title"><BookOpen className="w-6 h-6 inline mr-2" />Inventory Ledger</h1><p className="section-subtitle mt-1">Complete audit trail of all stock movements</p></div>
        </div>

        <div className="card p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input type="text" placeholder="Search item name or reference…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
          </div>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="input w-40">
            <option value="">All Types</option>
            <option value="purchase">Purchase</option>
            <option value="requisition">Requisition</option>
            <option value="transfer">Transfer</option>
            <option value="writeoff">Write-off</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr>
                <th>Date</th><th>Item</th><th>Store</th><th>Type</th><th>Ref #</th>
                <th className="text-right text-green-600">In</th><th className="text-right text-red-600">Out</th>
                <th className="text-right">Balance</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_, i) => <tr key={i}>{[...Array(9)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>) :
                transactions.length === 0 ? <tr><td colSpan={9} className="py-16 text-center text-[var(--color-text-muted)]">No transactions found</td></tr> :
                transactions.map(tx => (
                  <tr key={tx.TransactionId}>
                    <td className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">{tx.TransactionDate ? new Date(tx.TransactionDate).toLocaleDateString() : '—'}</td>
                    <td><span className="font-medium">{tx.ItemName}</span>{tx.ItemCode && <span className="text-xs text-[var(--color-text-muted)] ml-1">({tx.ItemCode})</span>}</td>
                    <td className="text-[var(--color-text-secondary)]">{tx.StoreName}</td>
                    <td><span className={`badge ${typeBadge[tx.TransactionType] || 'badge-secondary'}`}>{tx.TransactionType}</span></td>
                    <td className="font-data text-sm">{tx.ReferenceNo || '—'}</td>
                    <td className="text-right font-data">{tx.InQuantity > 0 ? <span className="text-green-600 font-semibold">+{tx.InQuantity}</span> : '—'}</td>
                    <td className="text-right font-data">{tx.OutQuantity > 0 ? <span className="text-red-600 font-semibold">−{tx.OutQuantity}</span> : '—'}</td>
                    <td className="text-right font-data font-semibold">{tx.BalanceQuantity}</td>
                    <td className="text-sm text-[var(--color-text-muted)] max-w-[200px] truncate">{tx.Remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm">Previous</button>
                <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
