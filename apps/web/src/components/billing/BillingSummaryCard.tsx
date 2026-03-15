interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'teal' | 'red' | 'yellow' | 'green' | 'blue' | 'gray';
  icon?: string;
}

const colorMap = {
  teal:   'text-teal-600 dark:text-teal-400',
  red:    'text-red-600 dark:text-red-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  green:  'text-green-600 dark:text-green-400',
  blue:   'text-blue-600 dark:text-blue-400',
  gray:   'text-[var(--color-text-secondary)]',
};

export default function BillingSummaryCard({ label, value, sub, color = 'teal', icon }: Props) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colorMap[color]}`}>
            {typeof value === 'number' ? `৳${value.toLocaleString()}` : value}
          </p>
          {sub && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{sub}</p>}
        </div>
        {icon && <span className="text-2xl opacity-60">{icon}</span>}
      </div>
    </div>
  );
}
