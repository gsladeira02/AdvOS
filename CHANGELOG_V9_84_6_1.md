# AdvOS v9.84.6.1

Correção do build Vercel na rota `src/app/api/signatures/view/route.ts`.

- Reestabelecida a função `resolveSignerWithPublicToken` local da rota.
- Validação pública usa `signature_requests.public_token`, com compatibilidade para `signer_token` legado.
- A página pública continua restrita ao cliente/signatário de ordem 1.
- Registro de `documento_visualizado` preservado.
