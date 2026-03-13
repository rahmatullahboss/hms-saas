import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonCard } from '../../components/LoadingSkeleton';

interface Conversation {
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  last_message_at: string;
  unread_count: number;
  last_message: string;
}

interface Message {
  id: number;
  sender_type: 'patient' | 'doctor';
  message: string;
  is_read: number;
  created_at: string;
}

export default function PatientMessages() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  const loadConversations = () => {
    axios.get('/api/patient-portal/messages', { headers })
      .then(({ data }) => setConversations(data.conversations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConversations(); }, [token]);

  const openThread = async (conv: Conversation) => {
    setSelectedDoctor(conv);
    const { data } = await axios.get(`/api/patient-portal/messages/${conv.doctor_id}?limit=100`, { headers });
    setMessages(data.data ?? []);
    loadConversations(); // refresh unread
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedDoctor) return;
    setSending(true);
    try {
      await axios.post('/api/patient-portal/messages', {
        doctorId: selectedDoctor.doctor_id,
        message: newMessage,
      }, { headers });
      setNewMessage('');
      await openThread(selectedDoctor);
    } catch { /* */ }
    setSending(false);
  };

  if (loading) return <SkeletonCard count={3} />;

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  };

  // Thread view
  if (selectedDoctor) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <button onClick={() => setSelectedDoctor(null)} style={{
            background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 12px',
            fontSize: '13px', cursor: 'pointer', color: '#475569',
          }}>← Back</button>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>🩺 {selectedDoctor.doctor_name}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedDoctor.specialty || 'General'}</div>
          </div>
        </div>

        <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '14px' }}>
              No messages yet. Start the conversation!
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} style={{
              alignSelf: m.sender_type === 'patient' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
            }}>
              <div style={{
                background: m.sender_type === 'patient'
                  ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : '#f1f5f9',
                color: m.sender_type === 'patient' ? '#fff' : '#0f172a',
                padding: '10px 14px', borderRadius: '14px',
                fontSize: '14px', lineHeight: 1.4,
              }}>
                {m.message}
              </div>
              <div style={{
                fontSize: '11px', color: '#94a3b8', marginTop: '4px',
                textAlign: m.sender_type === 'patient' ? 'right' : 'left',
              }}>
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <input value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '10px',
              border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
            }} />
          <button onClick={sendMessage} disabled={sending || !newMessage.trim()} style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: '#0891b2', color: '#fff', fontWeight: 600, fontSize: '14px',
            cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1,
          }}>
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    );
  }

  // Conversations list
  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>
        💬 Messages
      </h2>
      {conversations.length === 0 ? (
        <div style={{ ...cardStyle, padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          No messages yet. Your conversations with doctors will appear here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {conversations.map((conv) => (
            <div key={conv.doctor_id} onClick={() => openThread(conv)} style={{
              ...cardStyle, padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>🩺 {conv.doctor_name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{conv.specialty || 'General'}</div>
                  <div style={{
                    fontSize: '13px', color: '#475569', marginTop: '4px',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px',
                  }}>
                    {conv.last_message}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {new Date(conv.last_message_at).toLocaleDateString()}
                  </div>
                  {conv.unread_count > 0 && (
                    <div style={{
                      background: '#0891b2', color: '#fff', borderRadius: '10px',
                      padding: '1px 8px', fontSize: '11px', fontWeight: 600, minWidth: '18px', textAlign: 'center',
                    }}>
                      {conv.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
