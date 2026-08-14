'use client';

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="table-pagination flex flex-col gap-2 border-t border-[#eee8df] bg-[#faf8f4] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
        <span>{totalItems ? `${start}–${end} de ${totalItems}` : '0 registros'}</span>
        <label className="inline-flex items-center gap-2">
          <span>Linhas por página</span>
          <select
            className="rounded-lg border border-[#ded3c2] bg-white px-2 py-1 text-[11px] font-black text-slate-800 outline-none"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Linhas por página"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost !h-8 !w-8 !rounded-lg !p-0" disabled={safePage <= 1} onClick={() => onPageChange(1)} aria-label="Primeira página"><ChevronFirst size={14}/></button>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !rounded-lg !p-0" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Página anterior"><ChevronLeft size={14}/></button>
        <span className="min-w-[86px] text-center text-[11px] font-black text-slate-700">Página {safePage} de {totalPages}</span>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !rounded-lg !p-0" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} aria-label="Próxima página"><ChevronRight size={14}/></button>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !rounded-lg !p-0" disabled={safePage >= totalPages} onClick={() => onPageChange(totalPages)} aria-label="Última página"><ChevronLast size={14}/></button>
      </div>
    </div>
  );
}
