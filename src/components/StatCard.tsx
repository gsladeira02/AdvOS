export function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="panel p-4">
      <p className="label">{label}</p>
      <h2 className="mt-2 text-[1.45rem] font-black text-ink">{value}</h2>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
