# AdvOS V9.55 — senha simplificada e administradores

## Senhas
- Cadastro de usuários agora aceita senhas com no mínimo 6 caracteres.
- São permitidos somente letras (`A-Z`, `a-z`) e números (`0-9`).
- A senha pode ser somente numérica, somente alfabética ou alfanumérica.
- A mesma regra é validada no formulário e novamente no backend.

## Administradores
- Novo usuário pode ser criado diretamente como **Membro** ou **Administrador**.
- Na tela **Usuários**, administradores podem promover outro usuário para Administrador.
- Administradores também podem rebaixar outro administrador para Membro.
- A própria conta não pode remover seu próprio papel de administrador, evitando perda acidental de acesso ao painel administrativo.
- Mudanças de perfil são registradas no log de segurança.

## Banco de dados
- Nenhuma migration é necessária: o campo `profiles.role` já existe no schema atual.
