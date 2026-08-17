# AdvOS v9.84 — Assinatura nativa reconstruída

- Removida a dependência operacional e visual de ZapSign no fluxo nativo de assinatura.
- Link público do cliente é sempre gerado com o host/protocolo encaminhados pela Vercel.
- Cliente: visualização obrigatória, selfie + OTP + confirmação do nome; nenhuma assinatura manual.
- Daniel Costa Ladeira: assinatura apenas dentro do AdvOS, autenticado, sem token público, OTP, selfie ou desenho manual; visualização obrigatória.
- Cliente nunca recebe ou visualiza o link do próximo signatário.
- Assinaturas concluídas agora exibem o PDF assinado dentro da aba Assinaturas, além de permitir abrir e baixar.
- Aba Assinaturas permanece disponível no PWA.
- Contrato reformulado para layout jurídico de coluna única, cabeçalho/rodapé, margens, tipografia e paginação mais estáveis.
