import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface AuditLog {
  id: number;
  tenant_id: number;
  user_id: number;
  action: string;
  table_name: string;
  record_id: number;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  created_at: string;
  user_name: string;
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString();
};

export default function AuditLogs({ role = 'md' }: { role?: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ userId: '', tableName: '', startDate: '', endDate: '' });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.tableName) params.append('tableName', filters.tableName);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      
      const res = await axios.get(`/api/audit?${params}`, { headers });
      setLogs(res.data.auditLogs || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-800';
      case 'UPDATE': return 'bg-blue-100 text-blue-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      case 'APPROVE': return 'bg-purple-100 text-purple-800';
      case 'REJECT': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Audit Logs</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="border rounded-lg p-2" placeholder="Start Date" />
          <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="border rounded-lg p-2" placeholder="End Date" />
          <select value={filters.tableName} onChange={(e) => setFilters({ ...filters, tableName: e.target.value })} className="border rounded-lg p-2">
            <option value="">All Tables</option>
            <option value="income">Income</option>
            <option value="expenses">Expenses</option>
            <option value="chart_of_accounts">Chart of Accounts</option>
            <option value="journal_entries">Journal Entries</option>
            <option value="profit_distributions">Profit Distributions</option>
          </select>
          <button onClick={fetchLogs} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Record ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-400">No audit logs found</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLog(log)}>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(log.created_at)}</td>
                  <td className="px-6 py-4">{log.user_name || `User #${log.user_id}`}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{log.table_name}</td>
                  <td className="px-6 py-4 text-gray-500">#{log.record_id}</td>
                  <td className="px-6 py-4 text-blue-600 text-sm">View Details</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Audit Log Details</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">User</p>
                  <p className="font-medium">{selectedLog.user_name || `User #${selectedLog.user_id}`}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Action</p>
                  <span className={`px-2 py-1 rounded-full text-xs ${getActionColor(selectedLog.action)}`}>
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Table</p>
                  <p className="font-medium">{selectedLog.table_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Record ID</p>
                  <p className="font-medium">#{selectedLog.record_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">IP Address</p>
                  <p className="font-medium">{selectedLog.ip_address || 'N/A'}</p>
                </div>
              </div>

              {selectedLog.old_value && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Old Value</p>
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLog.old_value), null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_value && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">New Value</p>
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLog.new_value), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
