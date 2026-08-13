export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header mb-4 rounded-[18px] border border-[#e6dccb] bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-[1.35rem] font-black leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="page-header-subtitle mt-1 max-w-5xl break-words text-xs font-medium leading-relaxed text-slate-600">{subtitle}</p>}
        </div>
        {action && <div className="page-header-action flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
