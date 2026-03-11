import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface Test {
  id: number;
  patient_id: number;
  patient_name: string;
  test_name: string;
  result: string;
  date: string;
  status: string;
}

export default function LaboratoryDashboard({ role = 'laboratory' }: { role?: string }) {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [result, setResult] = useState('');

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/tests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTests(data.tests || []);
    } catch (error) {
      toast.error('Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  };

  const handleResultSubmit = async (testId: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tests/${testId}/result`, { result }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Result saved');
      setSelectedTest(null);
      setResult('');
      fetchTests();
    } catch (error) {
      toast.error('Failed to save result');
    }
  };

  const handlePrint = (test: Test) => {
    const printContent = `
      <h1>Test Report</h1>
      <p><strong>Patient ID:</strong> ${test.patient_id}</p>
      <p><strong>Test:</strong> ${test.test_name}</p>
      <p><strong>Date:</strong> ${new Date(test.date).toLocaleDateString()}</p>
      <p><strong>Result:</strong> ${test.result || 'Pending'}</p>
    `;
    const windowPrint = window.open('', '', 'width=600,height=600');
    if (windowPrint) {
      windowPrint.document.write(printContent);
      windowPrint.document.close();
      windowPrint.print();
    }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Laboratory Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-primary-600">
              {tests.filter(t => t.status === 'pending').length}
            </div>
            <div className="text-gray-600">Pending Tests</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">
              {tests.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-gray-600">Completed Tests</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-600">{tests.length}</div>
            <div className="text-gray-600">Total Tests</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center">Loading...</td></tr>
              ) : tests.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center">No tests found</td></tr>
              ) : (
                tests.map((test) => (
                  <tr key={test.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">#{test.patient_id}</td>
                    <td className="px-6 py-4 text-sm font-medium">{test.test_name}</td>
                    <td className="px-6 py-4 text-sm">{new Date(test.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        test.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {test.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      {test.status === 'pending' ? (
                        <button
                          onClick={() => { setSelectedTest(test); setResult(test.result || ''); }}
                          className="text-primary-600 hover:underline"
                        >
                          Enter Result
                        </button>
                      ) : (
                        <button onClick={() => handlePrint(test)} className="text-green-600 hover:underline">
                          Print
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedTest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">Enter Result for {selectedTest.test_name}</h3>
              <textarea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg h-32"
                placeholder="Enter test result..."
              />
              <div className="flex gap-4 mt-4">
                <button
                  onClick={() => handleResultSubmit(selectedTest.id)}
                  className="flex-1 bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700"
                >
                  Save
                </button>
                <button
                  onClick={() => { setSelectedTest(null); setResult(''); }}
                  className="px-6 py-2 border rounded-lg hover:bg-gray-50"
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