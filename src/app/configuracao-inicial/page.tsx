export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';

export default function ConfiguracaoInicial(){
  redirect('/app/configuracoes');
}
