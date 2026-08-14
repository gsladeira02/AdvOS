export function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="stat-card panel min-w-0 p-3.5">
      <p className="label truncate" title={label}>{label}</p>
      <h2 className="mt-1.5 truncate text-[1.32rem] font-black leading-tight tracking-[-.02em] text-ink" title={String(value)}>{value}</h2>
      {detail && <p className="stat-card-detail mt-1 truncate text-[10px] font-medium text-slate-500" title={detail}>{detail}</p>}
    </div>
  );
}
