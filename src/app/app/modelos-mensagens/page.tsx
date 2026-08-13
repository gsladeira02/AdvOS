import { redirect } from 'next/navigation';

export default function ModelosMensagens() {
  redirect('/app/whatsapp?view=configuracoes&section=modelos');
}
