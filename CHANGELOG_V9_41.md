# AdvOS v9.41

## Correção de build do fluxo MFA

- Corrigida a tipagem de `secureTarget` no login para usar `SupabaseClient`.
- O TypeScript agora infere corretamente o retorno de `getAuthenticatorAssuranceLevel()`.
- Mantida a correção de deadlock da v9.40: consultas MFA continuam fora de `onAuthStateChange`.
- Nenhuma mudança de banco ou SQL.
