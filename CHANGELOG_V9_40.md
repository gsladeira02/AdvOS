# AdvOS v9.40 — Correção do fluxo MFA/login

- Corrige travamento em “Verificando sessão...” após login.
- Remove chamada Auth/MFA assíncrona de dentro de `onAuthStateChange`, evitando deadlock conhecido do supabase-js.
- O fluxo passa a ser determinístico: senha → AAL → setup MFA ou desafio MFA → aplicação.
- Adiciona timeout às chamadas de autenticação para a interface nunca ficar presa indefinidamente.
- Sessões locais incompletas/stale são limpas e o usuário recebe uma mensagem clara para entrar novamente.
- Mantém MFA obrigatório e todas as proteções da v9.39.
- Não requer SQL adicional.
