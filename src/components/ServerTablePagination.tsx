import Link from 'next/link';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function href(basePath: string, page: number, pageSize: number) {
  const params = new URLSearchParams();
  params.set('pagina', String(page));
  params.set('por_pagina', String(pageSize));
  return `${basePath}?${params.toString()}`;
}

export function ServerTablePagination({
  basePath,
  page,
  pageSize,
  totalItems,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="table-pagination flex flex-col gap-2 border-t border-[#eee8df] bg-[#faf8f4] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
        <span>{totalItems ? `${start}–${end} de ${totalItems}` : '0 registros'}</span>
        <form method="get" action={basePath} className="inline-flex items-center gap-2">
          <input type="hidden" name="pagina" value="1" />
          <label htmlFor={`page-size-${basePath.replace(/\W+/g, '-')}`}>Linhas por página</label>
          <select
            id={`page-size-${basePath.replace(/\W+/g, '-')}`}
            name="por_pagina"
            defaultValue={String(pageSize)}
            className="rounded-lg border border-[#ded3c2] bg-white px-2 py-1 text-[11px] font-black text-slate-800 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <button className="btn btn-ghost !rounded-lg !px-2 !py-1 text-[10px]" type="submit">Aplicar</button>
        </form>
      </div>

      <div className="flex items-center gap-1 text-[11px] font-black">
        <Link aria-disabled={safePage <= 1} className={`btn btn-ghost !rounded-lg !px-2 !py-1 ${safePage <= 1 ? 'pointer-events-none opacity-40' : ''}`} href={href(basePath, 1, pageSize)}>«</Link>
        <Link aria-disabled={safePage <= 1} className={`btn btn-ghost !rounded-lg !px-2 !py-1 ${safePage <= 1 ? 'pointer-events-none opacity-40' : ''}`} href={href(basePath, Math.max(1, safePage - 1), pageSize)}>‹</Link>
        <span className="min-w-[86px] text-center text-slate-700">Página {safePage} de {totalPages}</span>
        <Link aria-disabled={safePage >= totalPages} className={`btn btn-ghost !rounded-lg !px-2 !py-1 ${safePage >= totalPages ? 'pointer-events-none opacity-40' : ''}`} href={href(basePath, Math.min(totalPages, safePage + 1), pageSize)}>›</Link>
        <Link aria-disabled={safePage >= totalPages} className={`btn btn-ghost !rounded-lg !px-2 !py-1 ${safePage >= totalPages ? 'pointer-events-none opacity-40' : ''}`} href={href(basePath, totalPages, pageSize)}>»</Link>
      </div>
    </div>
  );
}
