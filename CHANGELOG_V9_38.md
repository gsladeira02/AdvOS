# AdvOS v9.38 — Permissão de localização

- Corrige `Permissions-Policy` para permitir geolocalização somente no próprio domínio (`geolocation=(self)`).
- Mantém câmera e microfone restritos ao próprio domínio.
- Diferencia permissão negada, localização indisponível e timeout.
- Verifica HTTPS antes de solicitar localização.
- Não exige migração SQL.
