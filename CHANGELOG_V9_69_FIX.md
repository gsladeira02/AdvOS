# AdvOS v9.69 - Fix de build

- Corrigido erro TypeScript em `src/app/api/whatsapp/messages/forward/route.ts`.
- Substituído spread de `Set` por `Array.from(new Set(...))` para compatibilidade com o target TypeScript atual.
