import { useRegisterSW } from 'virtual:pwa-register/react';
import { usePushNotifications } from '../hooks/usePushNotifications';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      console.log('[PWA] Service worker registered:', registration);
    },
    onRegisterError(error: unknown) {
      console.error('[PWA] Service worker registration error:', error);
    },
  });

  const {
    isSupported,
    permission,
    isSubscribed,
    loading: pushLoading,
    subscribe: subscribePush,
  } = usePushNotifications();

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  // Show notification prompt if push is supported and not yet granted
  const showPushPrompt =
    isSupported && permission === 'default' && !isSubscribed && !needRefresh && !offlineReady;

  if (!needRefresh && !offlineReady && !showPushPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        zIndex: 9999,
        background: '#1e1b4b',
        border: '1px solid #6366f1',
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        color: '#fff',
        boxShadow: '0 4px 24px rgba(99,102,241,0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        maxWidth: '320px',
        fontSize: '0.875rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>
        {offlineReady
          ? '✅ অ্যাপ অফলাইনে ব্যবহারের জন্য প্রস্তুত!'
          : needRefresh
            ? '🔄 নতুন আপডেট পাওয়া গেছে!'
            : '🔔 নোটিফিকেশন চালু করুন — গুরুত্বপূর্ণ আপডেট পেতে'}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.375rem 0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            আপডেট করুন
          </button>
        )}
        {showPushPrompt && (
          <button
            onClick={subscribePush}
            disabled={pushLoading}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.375rem 0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              opacity: pushLoading ? 0.6 : 1,
            }}
          >
            {pushLoading ? '...' : '🔔 চালু করুন'}
          </button>
        )}
        <button
          onClick={close}
          style={{
            background: 'transparent',
            color: '#a5b4fc',
            border: '1px solid #4338ca',
            borderRadius: '0.5rem',
            padding: '0.375rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          বন্ধ করুন
        </button>
      </div>
    </div>
  );
}
