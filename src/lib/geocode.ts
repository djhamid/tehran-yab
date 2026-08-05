/** Free-text place search via OpenStreetMap Nominatim, bounded to greater Tehran + Karaj. */
export type GeoResult = { label: string; sub: string; lat: number; lng: number };

// left,top,right,bottom — covers Tehran proper plus Karaj (line 5 territory)
const VIEWBOX = '50.70,35.95,51.75,35.40';

// Nominatim usage policy: max 1 req/s — throttle at module level
let lastCall = 0;

export async function geocode(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  if (signal?.aborted) return [];
  lastCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fa&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) return [];
  const js: { display_name?: string; lat: string; lon: string }[] = await r.json();
  return js
    .map(x => {
      const parts = String(x.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
      return {
        label: parts[0] || query,
        sub: parts.slice(1, 3).join('، '),
        lat: Number(x.lat),
        lng: Number(x.lon),
      };
    })
    .filter(g => isFinite(g.lat) && isFinite(g.lng))
    .slice(0, 4);
}
