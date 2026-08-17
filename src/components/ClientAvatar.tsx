'use client';

import { useEffect, useState } from 'react';

type Props = {
  clientId?: string | null;
  name?: string | null;
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  title?: string;
};

function initials(name?: string | null) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

export function ClientAvatar({
  clientId,
  name,
  avatarPath,
  avatarUpdatedAt,
  className = 'h-9 w-9',
  fallbackClassName = 'bg-[#075e54] text-white',
  imageClassName = '',
  title,
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [clientId, avatarPath, avatarUpdatedAt]);

  const hasPhoto = Boolean(clientId && avatarPath && !failed);
  const version = encodeURIComponent(String(avatarUpdatedAt || avatarPath || '1'));
  const src = hasPhoto ? `/api/clients/avatar?client_id=${encodeURIComponent(String(clientId))}&v=${version}` : '';

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${className} ${hasPhoto ? 'bg-slate-100' : fallbackClassName}`}
      title={title || String(name || '')}
      aria-label={name ? `Foto de ${name}` : 'Foto do cliente'}
    >
      {hasPhoto ? (
        <img
          src={src}
          alt={name ? `Foto de ${name}` : 'Foto do cliente'}
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[10px] font-black leading-none">{initials(name)}</span>
      )}
    </div>
  );
}
