import { useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
};

export default function Reports({ role = 'md' }: { role?: string }) {
  const [reportType, setReportType] = useState('pl');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      let res;
      if (reportType === 'pl') {
        res = await axios.get(`/api/reports/pl?startDate=${startDate}&endDate=${endDate}`, { headers });
        setData(res.data);
      } else if (reportType === 'income') {
        res = await axios.get(`/api/reports/income-by-source?startDate=${startDate}&endDate=${endDate}`, { headers });
        setData(res.data);
      } else if (reportType === 'expense') {
        res = await axios.get(`/api/reports/expense-by-category?startDate=${startDate}&endDate=${endDate}`, { headers });
        setData(res.data);
      } else if (reportType === 'monthly') {
        res = await axios.get(`/api/reports/monthly?year=${new Date().getFullYear()}`, { headers });
        setData(res.data);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    window.print();
  };

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Financial Reports</h1>
        <button onClick={printReport} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
          Print Report
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="w-full border rounded-lg p-2">
              <option value="pl">Profit & Loss</option>
              <option value="income">Income by Source</option>
              <option value="expense">Expense by Category</option>
              <option value="monthly">Monthly Summary</option>
            </select>
          </div>
          {reportType !== 'monthly' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
              </div>
            </>
          )}
          <div className="flex items-end">
            <button onClick={generateReport} disabled={loading} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {data && (
        <div className="bg-white rounded-xl shadow-sm p-6 print:shadow-none">
          {reportType === 'pl' && (
            <>
              <h2 className="text-xl font-bold text-center mb-6">Profit & Loss Statement</h2>
              <p className="text-center text-gray-500 mb-4">Period: {startDate} to {endDate}</p>
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Income</h3>
                <table className="w-full">
                  <tbody>
                    {data.income.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2">{item.source}</td>
                        <td className="py-2 text-right">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2">Total Income</td>
                      <td className="py-2 text-right text-green-600">{formatCurrency(data.income.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Expenses</h3>
                <table className="w-full">
                  <tbody>
                    {data.expenses.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2">{item.category}</td>
                        <td className="py-2 text-right">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2">Total Expenses</td>
                      <td className="py-2 text-right text-red-600">{formatCurrency(data.expenses.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border-t-2 pt-4">
                <table className="w-full">
                  <tr className="text-xl font-bold">
                    <td>Net Profit</td>
                    <td className={`text-right ${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.netProfit)}
                    </td>
                  </tr>
                </table>
              </div>
            </>
          )}

          {reportType === 'income' && (
            <>
              <h2 className="text-xl font-bold text-center mb-6">Income by Source</h2>
              <p className="text-center text-gray-500 mb-4">Period: {startDate} to {endDate}</p>
              
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-2 capitalize">{item.source}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2 text-right">{item.percentage}%</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right text-green-600">{formatCurrency(data.total)}</td>
                    <td className="px-4 py-2 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {reportType === 'expense' && (
            <>
              <h2 className="text-xl font-bold text-center mb-6">Expense by Category</h2>
              <p className="text-center text-gray-500 mb-4">Period: {startDate} to {endDate}</p>
              
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-2">{item.category}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2 text-right">{item.percentage}%</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right text-red-600">{formatCurrency(data.total)}</td>
                    <td className="px-4 py-2 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {reportType === 'monthly' && (
            <>
              <h2 className="text-xl font-bold text-center mb-6">Monthly Summary - {data.year}</h2>
              
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Expense</th>
                    <th className="px-4 py-2 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-2 capitalize">{item.month}</td>
                      <td className="px-4 py-2 text-right text-green-600">{formatCurrency(item.income)}</td>
                      <td className="px-4 py-2 text-right text-red-600">{formatCurrency(item.expense)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(item.profit)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right text-green-600">{formatCurrency(data.summary.totalIncome)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{formatCurrency(data.summary.totalExpense)}</td>
                    <td className={`px-4 py-2 text-right ${data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.summary.netProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <p className="text-center text-gray-400 text-sm mt-6">Generated on: {new Date().toLocaleString()}</p>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
