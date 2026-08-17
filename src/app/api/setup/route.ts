import { NextResponse } from 'next/server';

// O AdvOS é single-office. A configuração pública/automática foi desativada
// para impedir que um usuário autenticado sem perfil crie outro escritório.
export async function POST() {
  return NextResponse.json({ error: 'Configuração inicial desativada. Usuários devem ser criados pelo administrador do AdvOS.' }, { status: 403 });
}
