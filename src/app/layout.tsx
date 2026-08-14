import './globals.css';
import { headers } from 'next/headers';
import { PWARegister } from '@/components/PWARegister';

export const metadata = {
  title: 'AdvOS - Sistema jurídico interno',
  description: 'Sistema interno para escritórios de advocacia com WhatsApp, clientes, financeiro e documentos.',
  manifest: '/manifest.json',
  applicationName: 'AdvOS',
  appleWebApp: {
    capable: true,
    title: 'AdvOS',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#075e54',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Ler headers força SSR por request. Isso é necessário para o nonce da CSP
  // gerado no middleware ser aplicado aos scripts do Next/React.
  await headers();

  return (
    <html lang="pt-BR">
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
