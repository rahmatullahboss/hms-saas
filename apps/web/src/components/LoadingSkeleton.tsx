import React from 'react';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;
  style?: React.CSSProperties;
}

export default function LoadingSkeleton({
  width = '100%',
  height = '16px',
  borderRadius = '8px',
  count = 1,
  style,
}: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width, height, borderRadius,
          background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
          marginBottom: i < count - 1 ? '8px' : 0,
          ...style,
        }} />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );
}

/** Card-shaped skeleton for list items */
export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: '#fff', borderRadius: '12px', padding: '16px',
          border: '1px solid #f1f5f9',
        }}>
          <LoadingSkeleton width="60%" height="14px" />
          <div style={{ marginTop: '8px' }}>
            <LoadingSkeleton width="40%" height="12px" />
          </div>
          <div style={{ marginTop: '8px' }}>
            <LoadingSkeleton width="80%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}
