import React from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const btnBase: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
  transition: 'all 0.15s',
};

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '1rem', padding: '8px 0' }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={{ ...btnBase, ...(page <= 1 ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
      >
        ← Previous
      </button>
      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, minWidth: '80px', textAlign: 'center' }}>
        Page {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        style={{ ...btnBase, ...(page >= totalPages ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
      >
        Next →
      </button>
    </div>
  );
}
