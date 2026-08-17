# AdvOS v9.83 — Assinatura nativa reestruturada

- Reestruturado o fluxo de assinatura do AdvOS, sem dependência visual do ZapSign.
- Cliente: visualização obrigatória antes de assinar; selfie + OTP + confirmação do nome; sem desenho manual.
- Daniel Costa Ladeira: assinatura somente dentro do AdvOS, sem token público, OTP, selfie ou desenho manual; visualização obrigatória.
- Cliente nunca recebe o link/token do segundo signatário.
- Assinaturas concluídas agora possuem ação "Ver documento assinado" e "Baixar PDF".
- Assinaturas incluídas na navegação inferior do PWA.
- URL de assinatura passa a usar APP_URL/NEXT_PUBLIC_APP_URL quando configurado, evitando host incorreto.
- Removidos textos de ZapSign do fluxo nativo e templates passam a usar link_assinatura.
