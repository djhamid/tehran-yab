/** Nearby POI search via Overpass (OpenStreetMap) — «کافه لمیز نزدیک خانه خاله». */
import { haversineKm } from './route-finder';

export type Poi = { name: string; sub: string; icon: string; lat: number; lng: number; distKm: number };

/** Category keywords → Overpass tag filter. Brand terms (لمیز، …) fall through to a name search. */
const CATS = [
  { rx: /کاف[هی]|کافی\s?شاپ|قهوه|coffee|cafe/i, filter: '["amenity"~"cafe|coffee_shop"]', kind: 'کافه', icon: '☕' },
  { rx: /فست\s?فود|پیتزا|برگر|ساندویچ|fast\s?food|pizza|burger/i, filter: '["amenity"="fast_food"]', kind: 'فست‌فود', icon: '🍔' },
  { rx: /رستوران|غذاخوری|restaurant/i, filter: '["amenity"="restaurant"]', kind: 'رستوران', icon: '🍽️' },
  { rx: /داروخانه|pharmacy/i, filter: '["amenity"="pharmacy"]', kind: 'داروخانه', icon: '💊' },
  { rx: /بیمارستان|درمانگاه|hospital|clinic/i, filter: '["amenity"~"hospital|clinic"]', kind: 'مرکز درمانی', icon: '🏥' },
  { rx: /بانک|bank/i, filter: '["amenity"="bank"]', kind: 'بانک', icon: '🏦' },
  { rx: /خودپرداز|عابر\s?بانک|atm/i, filter: '["amenity"="atm"]', kind: 'خودپرداز', icon: '🏧' },
  { rx: /پمپ\s?بنزین|سوخت|fuel/i, filter: '["amenity"="fuel"]', kind: 'پمپ بنزین', icon: '⛽' },
  { rx: /سوپرمارکت|هایپر|supermarket/i, filter: '["shop"~"supermarket|convenience"]', kind: 'فروشگاه', icon: '🛒' },
  { rx: /نانوایی|bakery/i, filter: '["shop"="bakery"]', kind: 'نانوایی', icon: '🥖' },
  { rx: /پارک|بوستان|park/i, filter: '["leisure"="park"]', kind: 'پارک', icon: '🌳' },
  { rx: /مسجد|mosque/i, filter: '["amenity"="place_of_worship"]["religion"="muslim"]', kind: 'مسجد', icon: '🕌' },
  { rx: /هتل|hotel/i, filter: '["tourism"="hotel"]', kind: 'هتل', icon: '🏨' },
];

/** Fallback meta when a name search returns a POI whose category we didn't ask for. */
const TAG_META: Record<string, { kind: string; icon: string }> = {
  cafe: { kind: 'کافه', icon: '☕' }, coffee_shop: { kind: 'کافه', icon: '☕' },
  restaurant: { kind: 'رستوران', icon: '🍽️' }, fast_food: { kind: 'فست‌فود', icon: '🍔' },
  pharmacy: { kind: 'داروخانه', icon: '💊' }, hospital: { kind: 'بیمارستان', icon: '🏥' }, clinic: { kind: 'درمانگاه', icon: '🏥' },
  bank: { kind: 'بانک', icon: '🏦' }, atm: { kind: 'خودپرداز', icon: '🏧' }, fuel: { kind: 'پمپ بنزین', icon: '⛽' },
  supermarket: { kind: 'فروشگاه', icon: '🛒' }, convenience: { kind: 'فروشگاه', icon: '🛒' }, bakery: { kind: 'نانوایی', icon: '🥖' },
  park: { kind: 'پارک', icon: '🌳' }, hotel: { kind: 'هتل', icon: '🏨' }, place_of_worship: { kind: 'مسجد', icon: '🕌' },
};

const rxEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type OverpassEl = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function overpass(selector: string): Promise<OverpassEl[]> {
  const q = `[out:json][timeout:15];${selector}out center 60;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!r.ok) return [];
  const js: { elements?: OverpassEl[] } = await r.json();
  return js.elements || [];
}

/**
 * `what` is a type or brand; brands may carry both scripts separated by `|` («لمیز|Lamiz»).
 * Returns up to 8 results sorted by distance from (lat,lng).
 */
export async function searchNearby(what: string, lat: number, lng: number): Promise<Poi[]> {
  const parts = what.split('|').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const cat = CATS.find(c => parts.some(p => c.rx.test(p)));
  // «کافه لمیز» → category کافه + brand «لمیز»; brand wins as a name search
  const names = parts.map(p => (cat ? p.replace(cat.rx, '') : p).trim()).filter(Boolean);

  // brand searches cast a wide net; a bare category stays local («کافه» near home ≠ all cafes in Tehran)
  // key regex `^name(:xx)?$` also matches name:fa / name:en so either script finds English-tagged POIs
  const sel = (r: number) => names.length
    ? `nwr[~"^name(:[a-z]+)?$"~"${names.map(rxEsc).join('|')}",i](around:${r},${lat},${lng});`
    : cat ? `nwr${cat.filter}(around:${r},${lat},${lng});` : null;
  const s = sel(names.length ? 6000 : 1800);
  if (!s) return [];

  let els = await overpass(s);
  if (!els.length && names.length) els = await overpass(sel(15000)!); // brand may be sparse — widen once

  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const e of els) {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    const t = e.tags || {};
    const name = t['name:fa'] || t.name || t.brand;
    if (!name || la == null || lo == null) continue;
    const key = `${name}@${la.toFixed(3)},${lo.toFixed(3)}`; // same name within ~100m = duplicate node/way
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = cat ?? TAG_META[t.amenity || t.shop || t.leisure || t.tourism || ''];
    out.push({
      name,
      sub: t['addr:street'] || meta?.kind || '',
      icon: meta?.icon || '📍',
      lat: la, lng: lo,
      distKm: haversineKm(lat, lng, la, lo),
    });
  }
  return out.sort((a, b) => a.distKm - b.distKm).slice(0, 8);
}
