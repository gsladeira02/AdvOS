'use client';

import { ExternalLink, MapPin, MapPinned } from 'lucide-react';
import { useMemo, useState } from 'react';

export function WhatsappLocationCard({
  latitude,
  longitude,
  name,
  address,
}: {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const validCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

  const urls = useMemo(() => {
    if (!validCoords) return { map: '', external: '' };
    const delta = 0.008;
    const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(',');
    return {
      map: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`,
      external: `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`,
    };
  }, [latitude, longitude, validCoords]);

  return (
    <div className="min-w-[230px] max-w-[360px] overflow-hidden rounded-2xl border border-emerald-100 bg-white/70">
      {expanded && validCoords ? (
        <div className="h-[220px] w-full overflow-hidden bg-slate-100">
          <iframe
            title="Localização compartilhada"
            src={urls.map}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => validCoords && setExpanded(true)}
          className="grid h-[118px] w-full place-items-center bg-[linear-gradient(135deg,#eef8f3,#f8fafc)] text-[#075e54]"
          title={validCoords ? 'Ver localização no mapa' : 'Localização sem coordenadas válidas'}
        >
          <div className="text-center">
            <MapPinned size={30} className="mx-auto" />
            <span className="mt-2 block text-[10px] font-black">{validCoords ? 'Ver localização' : 'Localização'}</span>
          </div>
        </button>
      )}

      <div className="space-y-2 p-3">
        <div>
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-700"><MapPin size={11} /> Localização compartilhada</div>
          <div className="mt-1 text-xs font-black text-slate-900">{name || 'Local compartilhado'}</div>
          {address && <div className="mt-0.5 text-[10px] font-semibold leading-relaxed text-slate-600">{address}</div>}
          {validCoords && <div className="mt-1 text-[9px] font-mono text-slate-500">{latitude.toFixed(6)}, {longitude.toFixed(6)}</div>}
        </div>

        {validCoords && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-800">
              {expanded ? 'Ocultar mapa' : 'Ver no AdvOS'}
            </button>
            <a href={urls.external} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-700 hover:underline">
              Abrir no mapa <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
