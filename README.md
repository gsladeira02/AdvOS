# AdvOS v9.38

Responsáveis, notas internas, filtros operacionais e autoria das mensagens no WhatsApp.

# AdvOS V9.36

## V9.36 — WhatsApp Encerrados

- Nova área **Encerrados** dentro do WhatsApp.
- Conversas podem ser encerradas manualmente sem apagar histórico, tags, lead, cliente ou mídias.
- Conversas encerradas saem de Atendimento e Financeiro/Jurídico e ficam centralizadas em Encerrados.
- É possível **reabrir** uma conversa, retornando ao setor de origem.
- Nova mensagem recebida do cliente reabre automaticamente a conversa no setor em que ela estava antes.
- Conversas encerradas ficam ordenadas pela data de encerramento.
- O compositor de mensagens e chamadas fica bloqueado enquanto a conversa estiver encerrada; é preciso reabrir antes de responder.
- O Dashboard passa a mostrar a quantidade de conversas encerradas separadamente das conversas ativas.

## Migração obrigatória

Antes do deploy da v9.36, rode no Supabase:

`supabase/v9_36_whatsapp_encerrados.sql`

A migração é aditiva e pode ser executada com a v9.35 ainda publicada.

## V9.35 — Ativar, desativar e excluir tags

- Cada tag agora possui ações explícitas **Salvar**, **Ativar/Desativar** e **Excluir**.
- **Desativar** mantém a tag cadastrada e preserva seus vínculos para reativação futura.
- **Excluir** é definitivo e remove a tag também das conversas onde estiver aplicada.
- A confirmação de exclusão informa claramente o impacto antes de continuar.
- O array legado de tags nas conversas também é limpo para não deixar referências antigas.
- Nenhuma migração SQL nova é necessária; usa a mesma estrutura da v9.33.

## V9.34 — Cores visuais e prévia de tags

- O seletor textual de cores foi substituído por uma paleta visual de cores.
- Tags exibem uma prévia em tempo real exatamente como aparecem na conversa.
- Tags já cadastradas também podem ter a cor alterada visualmente antes de salvar.
- O Funil de Leads usa o mesmo padrão visual de cores e prévia.
- Nenhuma migração SQL nova é necessária; esta versão usa a estrutura criada na v9.33.


Sistema jurídico interno com Next.js, Supabase e Vercel.

## V9.33 — Central de Configurações e Dashboard do WhatsApp

A área WhatsApp passa a ter quatro seções principais:

- **Dashboard**: quantidade de leads, funil por etapa, taxa de conversão, conversas por setor, não lidas e tags mais usadas.
- **Atendimento**: conversas, leads e contatos.
- **Financeiro/Jurídico**: conversas transferidas para acompanhamento jurídico ou financeiro.
- **Configurações**: tags, funil de leads, modelos de mensagem e preferências gerais.

### Tags

- Tags são cadastradas centralmente com nome, cor e status.
- Na conversa não existe mais campo livre para digitar tags.
- O usuário apenas seleciona ou desmarca tags previamente cadastradas.
- Tags antigas da v9.32 são migradas automaticamente para o catálogo.

### Funil de leads

- Etapas podem ser criadas, renomeadas, ordenadas e desativadas.
- É possível definir etapa inicial, etapa de conversão e etapa de perda.
- O nome **Lead / Leads** também pode ser personalizado.
- O cadastro como cliente continua sendo manual.

### Modelos

- Modelos de mensagem foram centralizados dentro de **WhatsApp → Configurações → Modelos de mensagem**.
- A rota antiga de Modelos redireciona para a nova central.

### Preferências

- Área inicial de novas conversas.
- Etapa inicial de novos leads.
- Salvamento automático de mídias recebidas na Pasta do Cliente.

## Migração obrigatória

Antes de publicar a v9.33, rode no SQL Editor do Supabase:

`supabase/v9_33_whatsapp_central_config_dashboard.sql`

A migração é aditiva sobre a v9.32 e deve ser executada **antes do deploy da v9.33**, porque o novo código consulta as tabelas de configuração assim que a página do WhatsApp abre.
