/** Nearby POI search via Photon (photon.komoot.io) — free fuzzy OSM search, fast and good with Persian.
 *  ponytail: Overpass dropped — all mirrors time out from Iran; Photon alone covers brands + categories. */
import { haversineKm } from './route-finder';

export type Poi = { name: string; sub: string; icon: string; lat: number; lng: number; distKm: number };

/** Category keywords → display meta; also used to split «کافه لمیز» into category + brand. */
const CATS = [
  { rx: /کاف[هی]|کافی\s?شاپ|قهوه|coffee|cafe/i, q: 'کافه', kind: 'کافه', icon: '☕' },
  { rx: /فست\s?فود|پیتزا|برگر|ساندویچ|fast\s?food|pizza|burger/i, q: 'فست فود', kind: 'فست‌فود', icon: '🍔' },
  { rx: /رستوران|غذاخوری|restaurant/i, q: 'رستوران', kind: 'رستوران', icon: '🍽️' },
  { rx: /داروخانه|pharmacy/i, q: 'داروخانه', kind: 'داروخانه', icon: '💊' },
  { rx: /بیمارستان|درمانگاه|hospital|clinic/i, q: 'بیمارستان', kind: 'مرکز درمانی', icon: '🏥' },
  { rx: /بانک|bank/i, q: 'بانک', kind: 'بانک', icon: '🏦' },
  { rx: /خودپرداز|عابر\s?بانک|atm/i, q: 'خودپرداز', kind: 'خودپرداز', icon: '🏧' },
  { rx: /پمپ\s?بنزین|سوخت|fuel/i, q: 'پمپ بنزین', kind: 'پمپ بنزین', icon: '⛽' },
  { rx: /سوپرمارکت|هایپر|supermarket/i, q: 'سوپرمارکت', kind: 'فروشگاه', icon: '🛒' },
  { rx: /نانوایی|bakery/i, q: 'نانوایی', kind: 'نانوایی', icon: '🥖' },
  { rx: /پارک|بوستان|park/i, q: 'پارک', kind: 'پارک', icon: '🌳' },
  { rx: /مسجد|mosque/i, q: 'مسجد', kind: 'مسجد', icon: '🕌' },
  { rx: /هتل|hotel/i, q: 'هتل', kind: 'هتل', icon: '🏨' },
];

/** OSM tag value → display meta, for results outside the asked category. */
const TAG_META: Record<string, { kind: string; icon: string }> = {
  cafe: { kind: 'کافه', icon: '☕' }, coffee_shop: { kind: 'کافه', icon: '☕' },
  restaurant: { kind: 'رستوران', icon: '🍽️' }, fast_food: { kind: 'فست‌فود', icon: '🍔' },
  pharmacy: { kind: 'داروخانه', icon: '💊' }, hospital: { kind: 'بیمارستان', icon: '🏥' }, clinic: { kind: 'درمانگاه', icon: '🏥' },
  bank: { kind: 'بانک', icon: '🏦' }, atm: { kind: 'خودپرداز', icon: '🏧' }, fuel: { kind: 'پمپ بنزین', icon: '⛽' },
  supermarket: { kind: 'فروشگاه', icon: '🛒' }, convenience: { kind: 'فروشگاه', icon: '🛒' }, bakery: { kind: 'نانوایی', icon: '🥖' },
  park: { kind: 'پارک', icon: '🌳' }, hotel: { kind: 'هتل', icon: '🏨' }, place_of_worship: { kind: 'مسجد', icon: '🕌' },
};

// POI-ish OSM keys — drops photon fuzzy noise (villages, peaks, streets)
const POI_KEYS = new Set(['amenity', 'shop', 'leisure', 'tourism', 'craft', 'healthcare', 'office']);

type Feature = { properties?: Record<string, string>; geometry?: { coordinates?: number[] } };

async function photon(q: string, lat: number, lng: number): Promise<Feature[]> {
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=30&lang=default`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const js: { features?: Feature[] } = await r.json();
  return js.features || [];
}

/**
 * `what` is a type or brand; brands may carry both scripts separated by `|` («لمیز|Lamiz»).
 * Returns up to 8 results sorted by distance from (lat,lng).
 */
export async function searchNearby(what: string, lat: number, lng: number): Promise<Poi[]> {
  const parts = what.split('|').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const cat = CATS.find(c => parts.some(p => c.rx.test(p)));
  // «کافه لمیز» → category کافه + brand «لمیز»; brand wins as the search term
  const names = parts.map(p => (cat ? p.replace(cat.rx, '') : p).trim()).filter(Boolean);
  const queries = names.length ? names.slice(0, 2) : [cat?.q || parts[0]];

  // sequential, stop at first hit — parallel photon calls trip its rate limit
  let raw: Feature[] = [];
  for (const q of queries) {
    raw = await photon(q, lat, lng).catch(() => [] as Feature[]);
    if (raw.length) break;
  }
  const maxKm = names.length ? 30 : 6; // brands: anywhere in greater Tehran; categories: nearby only
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const f of raw) {
    const p = f.properties || {};
    const [lo, la] = f.geometry?.coordinates || [];
    if (!p.name || la == null || lo == null || !POI_KEYS.has(p.osm_key)) continue;
    const d = haversineKm(lat, lng, la, lo);
    if (d > maxKm) continue;
    const key = `${p.name}@${la.toFixed(3)},${lo.toFixed(3)}`; // same name within ~100m = duplicate
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = TAG_META[p.osm_value] ?? cat;
    out.push({ name: p.name, sub: p.street || p.district || meta?.kind || '', icon: meta?.icon || '📍', lat: la, lng: lo, distKm: d });
  }
  return out.sort((a, b) => a.distKm - b.distKm).slice(0, 8);
}
