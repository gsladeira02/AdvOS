export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header mb-4 rounded-[18px] border border-[#e6dccb] bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.35rem] font-black tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="page-header-subtitle mt-1 max-w-5xl text-xs font-medium leading-relaxed text-slate-600">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
