export const SERVER_PAGE_SIZES = [10, 25, 50, 100] as const;

export function parseServerPagination(params?: Record<string, string | string[] | undefined>) {
  const pageRaw = Array.isArray(params?.pagina) ? params?.pagina[0] : params?.pagina;
  const pageSizeRaw = Array.isArray(params?.por_pagina) ? params?.por_pagina[0] : params?.por_pagina;
  const page = Math.max(1, Number.parseInt(String(pageRaw || '1'), 10) || 1);
  const requestedPageSize = Number.parseInt(String(pageSizeRaw || '25'), 10) || 25;
  const pageSize = SERVER_PAGE_SIZES.includes(requestedPageSize as any) ? requestedPageSize : 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}
