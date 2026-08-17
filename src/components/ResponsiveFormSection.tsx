import { ChevronDown, Plus } from 'lucide-react';

export function ResponsiveFormSection({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <section className={`card mb-5 hidden p-4 md:block ${className}`}>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-slate-950">{title}</h2>
            {description && <p className="mt-0.5 text-[11px] font-medium text-slate-500">{description}</p>}
          </div>
        </div>
        {children}
      </section>

      <details className={`mobile-disclosure card mb-3 md:hidden ${className}`}>
        <summary className="mobile-disclosure-summary">
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Plus size={14} /></span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-black text-slate-950">{title}</span>
              {description && <span className="mt-0.5 block truncate text-[9px] font-semibold text-slate-500">{description}</span>}
            </span>
          </span>
          <ChevronDown className="disclosure-chevron shrink-0 text-slate-400" size={16} />
        </summary>
        <div className="border-t border-[#eee8df] p-3">{children}</div>
      </details>
    </>
  );
}
