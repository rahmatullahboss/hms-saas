import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import { FlaskConical, Clock, TestTube, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface LabQueueItem {
  item_id: number;
  status: string;
  result: string | null;
  result_numeric: number | null;
  abnormal_flag: string;
  sample_status: string;
  collected_at: string | null;
  order_id: number;
  order_no: string;
  order_date: string;
  specimen_type: string;
  patient_name: string;
  patient_code: string;
  mobile: string;
  test_name: string;
  test_code: string;
  category: string;
  unit: string | null;
  normal_range: string | null;
  method: string | null;
  unit_price: number;
  line_total: number;
  priority: string;
}

interface DashboardStats {
  totalToday: number;
  pending: number;
  collected: number;
  processing: number;
  completed: number;
  criticalResults: number;
  abnormalResults: number;
}

const SAMPLE_STATUS_LABELS: Record<string, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  processing: 'Processing',
  completed: 'Completed',
  rejected: 'Rejected',
};

const NEXT_STATUS: Record<string, string> = {
  ordered: 'collected',
  collected: 'processing',
  processing: 'completed',
};

function AbnormalBadge({ flag }: { flag: string }) {
  const styles: Record<string, string> = {
    normal: 'bg-green-100 text-green-700',
    high: 'bg-orange-100 text-orange-700',
    low: 'bg-blue-100 text-blue-700',
    critical: 'bg-red-100 text-red-700 font-bold',
    pending: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    normal: '✓ Normal',
    high: '⬆ High',
    low: '⬇ Low',
    critical: '⚠ Critical',
    pending: '—',
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${styles[flag] ?? styles.pending}`}>
      {labels[flag] ?? flag}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'routine') return null;
  const style = priority === 'stat'
    ? 'bg-red-500 text-white'
    : 'bg-orange-400 text-white';
  return (
    <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded ${style} uppercase`}>
      {priority}
    </span>
  );
}

export default function LaboratoryDashboard({ role = 'laboratory' }: { role?: string }) {
  const [queue, setQueue] = useState<LabQueueItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LabQueueItem | null>(null);
  const [result, setResult] = useState('');
  const [resultNumeric, setResultNumeric] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const headers = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const [queueRes, statsRes] = await Promise.all([
        axios.get('/api/lab/orders/queue/today', { headers: headers() }),
        axios.get('/api/lab/dashboard/stats', { headers: headers() }),
      ]);
      setQueue(queueRes.data.queue || []);
      setStats(statsRes.data.stats || null);
    } catch {
      toast.error('Failed to fetch lab data');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const advanceSampleStatus = async (itemId: number, nextStatus: string) => {
    try {
      await axios.put(`/api/lab/items/${itemId}/sample-status`, { sampleStatus: nextStatus }, { headers: headers() });
      toast.success(`Status → ${SAMPLE_STATUS_LABELS[nextStatus]}`);
      fetchData();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleResultSubmit = async () => {
    if (!selectedItem) return;
    try {
      const body: Record<string, unknown> = { result };
      if (resultNumeric) body.resultNumeric = parseFloat(resultNumeric);
      await axios.put(`/api/lab/items/${selectedItem.item_id}/result`, body, { headers: headers() });
      toast.success('Result saved');
      setSelectedItem(null);
      setResult('');
      setResultNumeric('');
      fetchData();
    } catch {
      toast.error('Failed to save result');
    }
  };

  const filteredQueue = filter === 'all'
    ? queue
    : queue.filter((q) => q.sample_status === filter);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-primary-600" />
            Laboratory Dashboard
          </h1>
          <span className="text-sm text-gray-500">Today&apos;s Queue</span>
        </div>

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.totalToday}</div>
              <div className="text-xs text-gray-500 mt-1">Total Today</div>
            </div>
            <div className="card p-4 text-center cursor-pointer hover:ring-2 ring-yellow-300" onClick={() => setFilter('ordered')}>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Pending</div>
            </div>
            <div className="card p-4 text-center cursor-pointer hover:ring-2 ring-blue-300" onClick={() => setFilter('collected')}>
              <div className="text-2xl font-bold text-blue-600">{stats.collected}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1"><TestTube className="w-3 h-3" /> Collected</div>
            </div>
            <div className="card p-4 text-center cursor-pointer hover:ring-2 ring-purple-300" onClick={() => setFilter('processing')}>
              <div className="text-2xl font-bold text-purple-600">{stats.processing}</div>
              <div className="text-xs text-gray-500 mt-1">Processing</div>
            </div>
            <div className="card p-4 text-center cursor-pointer hover:ring-2 ring-green-300" onClick={() => setFilter('completed')}>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> Done</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.criticalResults}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Critical</div>
            </div>
            <div className="card p-4 text-center cursor-pointer hover:ring-2 ring-gray-200" onClick={() => setFilter('all')}>
              <div className="text-2xl font-bold text-gray-400">All</div>
              <div className="text-xs text-gray-500 mt-1">Reset Filter</div>
            </div>
          </div>
        )}

        {/* Queue Table */}
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sample</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Normal Range</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Flag</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : filteredQueue.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No tests in queue</td></tr>
              ) : (
                filteredQueue.map((item) => (
                  <tr key={item.item_id} className={`hover:bg-gray-50 ${item.abnormal_flag === 'critical' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{item.patient_name}</div>
                      <div className="text-xs text-gray-400">{item.patient_code} · {item.mobile}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">
                        {item.test_name}
                        <PriorityBadge priority={item.priority} />
                      </div>
                      <div className="text-xs text-gray-400">{item.test_code} · {item.category}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        item.sample_status === 'completed' ? 'bg-green-100 text-green-700' :
                        item.sample_status === 'processing' ? 'bg-purple-100 text-purple-700' :
                        item.sample_status === 'collected' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {SAMPLE_STATUS_LABELS[item.sample_status] ?? item.sample_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.result ? (
                        <span className="font-medium">{item.result}{item.unit ? <span className="text-xs text-gray-400 ml-1">{item.unit}</span> : ''}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {item.normal_range ?? '—'}
                      {item.unit ? ` ${item.unit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AbnormalBadge flag={item.abnormal_flag} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.sample_status !== 'completed' && NEXT_STATUS[item.sample_status] && (
                        item.sample_status === 'processing' ? (
                          <button
                            onClick={() => { setSelectedItem(item); setResult(item.result || ''); setResultNumeric(item.result_numeric?.toString() || ''); }}
                            className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1 mx-auto"
                          >
                            Enter Result
                          </button>
                        ) : (
                          <button
                            onClick={() => advanceSampleStatus(item.item_id, NEXT_STATUS[item.sample_status])}
                            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1 mx-auto"
                          >
                            {SAMPLE_STATUS_LABELS[NEXT_STATUS[item.sample_status]]} <ArrowRight className="w-3 h-3" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Result Entry Modal */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-1">Enter Result</h3>
              <p className="text-sm text-gray-500 mb-4">
                {selectedItem.test_name} — {selectedItem.patient_name}
              </p>

              {selectedItem.normal_range && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 text-sm text-blue-700">
                  Normal Range: <strong>{selectedItem.normal_range}</strong>
                  {selectedItem.unit ? ` ${selectedItem.unit}` : ''}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numeric Value {selectedItem.unit ? `(${selectedItem.unit})` : ''}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={resultNumeric}
                    onChange={(e) => setResultNumeric(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="e.g., 5.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Result Text</label>
                  <textarea
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg h-24 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="e.g., 5.5 mmol/L (Normal)"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleResultSubmit}
                  disabled={!result.trim()}
                  className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Save Result
                </button>
                <button
                  onClick={() => { setSelectedItem(null); setResult(''); setResultNumeric(''); }}
                  className="px-5 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}