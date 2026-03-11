import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface Serial {
  id: number;
  serial_number: string;
  patient_id: number;
  status: string;
  date: string;
}

interface Patient {
  id: number;
  name: string;
  mobile: string;
}

export default function ReceptionDashboard({ role = 'reception' }: { role?: string }) {
  const [serials, setSerials] = useState<Serial[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBill, setShowNewBill] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<number | null>(null);
  const [billData, setBillData] = useState({
    testBill: 0,
    doctorVisitBill: 0,
    operationBill: 0,
    medicineBill: 0,
    discount: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [serialRes, patientRes] = await Promise.all([
        axios.get('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/patients?search=', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSerials(serialRes.data.patients || []);
      setPatients(patientRes.data.patients || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBill = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/billing', { patientId: selectedPatient, ...billData }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Bill created');
      setShowNewBill(false);
      setSelectedPatient(null);
      setBillData({ testBill: 0, doctorVisitBill: 0, operationBill: 0, medicineBill: 0, discount: 0 });
    } catch (error) {
      toast.error('Failed to create bill');
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const todaySerials = serials.filter(s => s.date && s.date.startsWith(today));

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Reception Dashboard</h1>
          <div className="space-x-2">
            <button
              onClick={() => setShowNewBill(true)}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
            >
              New Bill
            </button>
            <Link
              to="/reception/patients/new"
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              New Patient
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-primary-600">{todaySerials.length}</div>
            <div className="text-gray-600">Today's Patients</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {todaySerials.filter(s => s.status === 'waiting').length}
            </div>
            <div className="text-gray-600">Waiting</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">
              {todaySerials.filter(s => s.status === 'in-progress').length}
            </div>
            <div className="text-gray-600">In Progress</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">
              {todaySerials.filter(s => s.status === 'completed').length}
            </div>
            <div className="text-gray-600">Completed</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Today's Serial List</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={3} className="px-6 py-4 text-center">Loading...</td></tr>
              ) : todaySerials.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-4 text-center">No patients today</td></tr>
              ) : (
                todaySerials.map((serial) => (
                  <tr key={serial.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{serial.serial_number}</td>
                    <td className="px-6 py-4 text-sm">#{serial.patient_id}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        serial.status === 'completed' ? 'bg-green-100 text-green-800' :
                        serial.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {serial.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showNewBill && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow p-6 max-w-lg w-full">
              <h3 className="text-lg font-bold mb-4">Create New Bill</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Patient</label>
                  <select
                    value={selectedPatient || ''}
                    onChange={(e) => setSelectedPatient(Number(e.target.value))}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Select Patient</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} - {p.mobile}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Test Bill</label>
                    <input
                      type="number"
                      value={billData.testBill}
                      onChange={(e) => setBillData({ ...billData, testBill: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Doctor Visit</label>
                    <input
                      type="number"
                      value={billData.doctorVisitBill}
                      onChange={(e) => setBillData({ ...billData, doctorVisitBill: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operation</label>
                    <input
                      type="number"
                      value={billData.operationBill}
                      onChange={(e) => setBillData({ ...billData, operationBill: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medicine</label>
                    <input
                      type="number"
                      value={billData.medicineBill}
                      onChange={(e) => setBillData({ ...billData, medicineBill: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount</label>
                    <input
                      type="number"
                      value={billData.discount}
                      onChange={(e) => setBillData({ ...billData, discount: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="bg-gray-100 p-4 rounded-lg">
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span>
                      {billData.testBill + billData.doctorVisitBill + billData.operationBill + billData.medicineBill - billData.discount + 50} Taka
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 text-right">(Includes 50 Taka fire service)</div>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleCreateBill}
                  className="flex-1 bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700"
                >
                  Create Bill
                </button>
                <button
                  onClick={() => setShowNewBill(false)}
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