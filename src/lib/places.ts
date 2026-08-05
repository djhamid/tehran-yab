/** Saved places (university, aunt's house, ...) persisted in localStorage. */
export type SavedPlace = { id: string; name: string; lat: number; lng: number; icon: string };

const KEY = 'tehranyab.places.v1';

export function loadPlaces(): SavedPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(p => p && p.id && p.name && isFinite(p.lat) && isFinite(p.lng)) : [];
  } catch { return []; }
}

export function storePlaces(places: SavedPlace[]) {
  try { localStorage.setItem(KEY, JSON.stringify(places)); } catch { /* quota/private mode */ }
}

export const newPlaceId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export const PLACE_ICONS = ['🏠', '🎓', '💼', '❤️', '🕌', '🏥', '🛍️', '📍'];
