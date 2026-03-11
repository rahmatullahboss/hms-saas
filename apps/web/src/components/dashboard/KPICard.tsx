import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
}

export default function KPICard({ title, value, icon, trend, loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-[var(--color-border)] rounded"></div>
          <div className="h-10 w-10 bg-[var(--color-border)] rounded-lg"></div>
        </div>
        <div className="mt-4 h-8 w-16 bg-[var(--color-border)] rounded"></div>
        <div className="mt-2 h-3 w-20 bg-[var(--color-border)] rounded"></div>
      </div>
    );
  }

  return (
    <div className="card p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">{title}</span>
        {icon && <div className="text-[var(--color-primary)]">{icon}</div>}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[var(--color-text-primary)]">{value}</span>
        {trend && (
          <span className={`flex items-center text-sm ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {trend.isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
    </div>
  );
}
