'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CheckSquare,
  Home,
  ListChecks,
  MessageCircle,
  Menu,
  Plug,
  Scale,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

const primaryItems = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/servicos', 'Serviços', ListChecks],
  ['/app/processos', 'Processos', Scale],
  ['/app/prazos', 'Prazos', CalendarDays],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/whatsapp', 'WhatsApp', MessageCircle],
  ['/app/tarefas', 'Tarefas', CheckSquare],
] as const;

const adminItems = [
  ['/app/usuarios', 'Usuários', UserCog],
  ['/app/integracoes', 'Integrações', Plug],
  ['/app/integracoes/asaas/importar', 'Importar Asaas', UploadCloud],
  ['/app/configuracoes', 'Configurações', Settings],
  ['/app/seguranca', 'Segurança', ShieldCheck],
] as const;

const regularManagementItems = [
  ['/app/configuracoes', 'Configurações', Settings],
] as const;

const mobileItems = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/prazos', 'Prazos', CalendarDays],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/whatsapp', 'WhatsApp', MessageCircle],
] as const;

function isActive(pathname: string, href: string) {
  if (href === '/app/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, Icon }: { href: string; label: string; Icon: any }) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`desktop-nav-link ${active ? 'is-active' : ''}`}
    >
      <Icon size={15} />
      <span>{label}</span>
    </Link>
  );
}

export function DesktopNavigation({ admin }: { admin: boolean }) {
  const management = admin ? adminItems : regularManagementItems;
  return (
    <nav className="desktop-nav" aria-label="Navegação principal">
      <p className="desktop-nav-label">Escritório</p>
      {primaryItems.map(([href, label, Icon]) => <NavLink key={href} href={href} label={label} Icon={Icon} />)}
      <p className="desktop-nav-label mt-3">Gestão</p>
      {management.map(([href, label, Icon]) => <NavLink key={href} href={href} label={label} Icon={Icon} />)}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Navegação principal do PWA">
      {mobileItems.map(([href, label, Icon]) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`mobile-bottom-nav-item ${active ? 'is-active' : ''}`}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMoreMenu({ admin }: { admin: boolean }) {
  const items = admin ? [...primaryItems.filter(([href]) => ['/app/servicos','/app/processos','/app/tarefas'].includes(href)), ...adminItems] : [...primaryItems.filter(([href]) => ['/app/servicos','/app/processos','/app/tarefas'].includes(href)), ...regularManagementItems];
  return (
    <details className="mobile-more-menu md:hidden">
      <summary aria-label="Mais áreas" title="Mais áreas"><Menu size={18} /></summary>
      <div className="mobile-more-panel">
        <p>Mais áreas</p>
        {items.map(([href, label, Icon]) => <Link key={href} href={href}><Icon size={15} /><span>{label}</span></Link>)}
      </div>
    </details>
  );
}
