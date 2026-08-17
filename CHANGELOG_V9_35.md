# AdvOS v9.35

## WhatsApp — gestão de tags

- Tags agora têm ações explícitas **Ativar**, **Desativar** e **Excluir**.
- Desativar mantém a tag cadastrada e os vínculos existentes, permitindo reativação posterior.
- Excluir passa a ser uma ação definitiva, inclusive quando a tag já está aplicada em conversas.
- Ao excluir, os vínculos relacionais são removidos pelo banco e o array legado de tags das conversas também é limpo.
- Confirmação de exclusão explica que a tag será removida das conversas e que a ação não pode ser desfeita.
- Sem alteração de banco de dados.
