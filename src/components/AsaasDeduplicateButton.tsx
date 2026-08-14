'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export function AsaasDeduplicateButton() {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/asaas/deduplicate"
      method="post"
      onSubmit={(event) => {
        const ok = window.confirm(
          'Limpar duplicações do Asaas? O AdvOS manterá um único registro por ID/chave de importação e mesclará clientes apenas quando houver ID Asaas ou CPF/CNPJ iguais.'
        );
        if (!ok) {
          event.preventDefault();
          return;
        }
        setSubmitting(true);
      }}
    >
      <button type="submit" disabled={submitting} className="btn btn-secondary w-full border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100">
        <Trash2 size={15} />
        {submitting ? 'Limpando duplicações…' : 'Limpar duplicações existentes'}
      </button>
    </form>
  );
}
