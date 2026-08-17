# AdvOS v9.62 — Foto do cliente

- Adicionada foto privada ao cadastro do cliente.
- Upload disponível diretamente na Pasta do Cliente.
- Imagens JPG, PNG e WebP são convertidas para WebP, recortadas em formato quadrado e compactadas automaticamente em até 512x512 px.
- A foto é armazenada no bucket privado `documents` e entregue por endpoint autenticado do AdvOS.
- A foto passa a aparecer na lista de Clientes (desktop e PWA).
- A foto passa a aparecer na lista de conversas/contatos do WhatsApp e no cabeçalho da conversa.
- Quando não houver foto cadastrada, o AdvOS continua exibindo as iniciais do cliente.
- Leads ainda não convertidos em cliente continuam usando iniciais; após vinculados a um cliente, passam a utilizar a foto cadastrada.
- A Cloud API do WhatsApp não fornece de forma documentada a foto de perfil pessoal do remetente; por isso a origem confiável da imagem é a ficha do cliente no AdvOS.

## Migration
Execute uma vez:

`supabase/v9_62_foto_cliente.sql`
