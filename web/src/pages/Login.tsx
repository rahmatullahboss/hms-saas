import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [loginType, setLoginType] = useState<'super' | 'hospital'>('hospital');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let url = '/api/admin/login';
      
      if (loginType === 'hospital') {
        // For hospital login, we need to use a custom approach
        // First, get the tenant by subdomain
        if (!subdomain) {
          toast.error('Please enter hospital subdomain');
          setLoading(false);
          return;
        }
        // Set the tenant header for the request
        const { data } = await axios.post('/api/auth/login', { 
          email, 
          password 
        }, {
          headers: {
            'X-Tenant-Subdomain': subdomain
          }
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('tenant', subdomain);
        localStorage.setItem('user', JSON.stringify(data.user));
        toast.success('Login successful!');
        window.location.href = `/${data.user.role}/dashboard`;
        setLoading(false);
        return;
      }
      
      const { data } = await axios.post(url, { email, password });
      localStorage.setItem('token', data.token);
      toast.success('Login successful!');
      window.location.href = '/admin/dashboard';
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          HMS - Hospital Management
        </h1>
        
        <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setLoginType('hospital')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              loginType === 'hospital' ? 'bg-white shadow text-primary-600' : 'text-gray-500'
            }`}
          >
            Hospital Login
          </button>
          <button
            type="button"
            onClick={() => setLoginType('super')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              loginType === 'super' ? 'bg-white shadow text-primary-600' : 'text-gray-500'
            }`}
          >
            Super Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {loginType === 'hospital' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Hospital</label>
              <div className="flex mt-1">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  https://
                </span>
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                  placeholder="hospital-name"
                  className="flex-1 px-3 py-2 border rounded-r-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  .yourdomain.com
                </span>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="mt-4 text-center text-sm text-gray-500">
          <p>Test credentials:</p>
          <p>Super Admin: admin@hms.com / admin123</p>
          <p>Hospital: hospital@general.com / hospital123</p>
        </div>
      </div>
    </div>
  );
}
