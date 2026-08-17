export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header mb-3 rounded-[16px] border border-[#e7e1d7] bg-white/90 px-4 py-3 shadow-[0_5px_18px_rgba(15,23,42,.035)] backdrop-blur">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.22rem] font-black leading-[1.25] tracking-[-.02em] text-ink">{title}</h1>
          {subtitle && <p className="page-header-subtitle mt-0.5 truncate text-[11px] font-medium text-slate-500" title={subtitle}>{subtitle}</p>}
        </div>
        {action && <div className="page-header-action flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
