'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ml from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import stationsRaw from '@/data/stations.json';
import graphRaw from '@/data/graph.json';
import linesRaw from '@/data/lines.json';
import pathsRaw from '@/data/paths.json';
import { findRoute, haversineKm, makeBidirectional, nearestStations, walkMinutes } from '@/lib/route-finder';
import { geocode, type GeoResult } from '@/lib/geocode';
import { loadPlaces, newPlaceId, PLACE_ICONS, storePlaces, type SavedPlace } from '@/lib/places';
import type { Graph, LinesMap, RouteResult, StationsMap } from '@/types/tehgo-metro';

const stations = stationsRaw as unknown as StationsMap;
const graph = makeBidirectional(graphRaw as unknown as Graph);
const lines = linesRaw as unknown as LinesMap;
const paths = pathsRaw as unknown as Record<string, { paths: { id: string; stations: string[] }[] }>;

const faNum = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const normalize = (s: string) => s.replace(/[آا]/g, 'ا').replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/‌/g, ' ').toLowerCase();
const faName = (id: string) => stations[id]?.translations?.fa || stations[id]?.name || id;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const stCoord = (id: string) => ({ lat: Number(stations[id].latitude), lng: Number(stations[id].longitude) });

/** An endpoint: a station (id set) or an arbitrary point (geolocation / map pick / geocoded place). */
type EP = { id?: string; lat: number; lng: number; label: string };
type ChatMsg = { role: 'user' | 'assistant' | 'action'; content: string };

type FullRoute = {
  metro: RouteResult;
  walkFrom?: { km: number; min: number; to: string };
  walkTo?: { km: number; min: number; from: string };
  totalMin: number;
};

function searchStations(q: string): { id: string; fa: string; color: string; lineNames: string }[] {
  const qn = normalize(q.trim());
  if (qn.length < 1) return [];
  const out: { id: string; fa: string; color: string; lineNames: string }[] = [];
  for (const [id, s] of Object.entries(stations)) {
    if (s.disabled) continue;
    const fa = s.translations?.fa || s.name;
    if (normalize(fa).includes(qn) || normalize(s.name).includes(qn)) {
      out.push({ id, fa, color: s.colors?.[0] || '#5eead4', lineNames: s.lines.map(l => lines[l]?.name?.fa || l).join('، ') });
    }
  }
  return out.slice(0, 8);
}

/** Terminal station name in the travel direction of a leg (for "به سمت ..."). */
function legDirection(line: string, a: string, b: string): string | null {
  for (const p of paths[line]?.paths || []) {
    const ia = p.stations.indexOf(a), ib = p.stations.indexOf(b);
    if (ia >= 0 && ib >= 0) return faName(ib > ia ? p.stations[p.stations.length - 1] : p.stations[0]);
  }
  return null;
}

function computeFullRoute(a: EP, b: EP): FullRoute | null {
  const nearA = a.id ? null : nearestStations(stations, a.lat, a.lng, 1)[0];
  const nearB = b.id ? null : nearestStations(stations, b.lat, b.lng, 1)[0];
  const fromId = a.id ?? nearA?.id, toId = b.id ?? nearB?.id;
  if (!fromId || !toId || fromId === toId) return null;
  const metro = findRoute(graph, stations, fromId, toId);
  if (!metro) return null;
  const walkFrom = nearA ? { km: nearA.km, min: walkMinutes(nearA.km), to: fromId } : undefined;
  const walkTo = nearB ? { km: nearB.km, min: walkMinutes(nearB.km), from: toId } : undefined;
  return { metro, walkFrom, walkTo, totalMin: metro.minutes + (walkFrom?.min || 0) + (walkTo?.min || 0) };
}

/** Google Maps directions link (walking by default) — opens the native app on mobile. */
const gmapsUrl = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode = 'walking') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;

/** Hide <map>{...}</map> command blocks (incl. a partially streamed one) from chat bubbles. */
const stripCmd = (t: string) => t
  .replace(/<map>[\s\S]*?<\/map>/g, '')
  .replace(/<map>[\s\S]*$/, '')
  .replace(/<\/?m?a?p?>?\s*$/, '')
  .trim();

/** Debounced Nominatim search for free-text inputs. */
function useGeoSearch(q: string, active: boolean): GeoResult[] {
  const [results, setResults] = useState<GeoResult[]>([]);
  useEffect(() => {
    if (!active || q.trim().length < 3) { setResults([]); return; }
    let dead = false;
    const t = setTimeout(() => geocode(q).then(r => { if (!dead) setResults(r); }).catch(() => {}), 700);
    return () => { dead = true; clearTimeout(t); setResults([]); };
  }, [q, active]);
  return results;
}

// ---- static GeoJSON built once at module load ----
const lineFeatures = {
  type: 'FeatureCollection' as const,
  features: Object.entries(paths).flatMap(([lineId, v]) =>
    v.paths.map(p => ({
      type: 'Feature' as const,
      properties: { color: lines[lineId]?.color || '#888' },
      geometry: { type: 'LineString' as const, coordinates: p.stations.filter(s => stations[s]).map(s => [Number(stations[s].longitude), Number(stations[s].latitude)]) },
    }))),
};
const stationFeatures = {
  type: 'FeatureCollection' as const,
  features: Object.entries(stations).map(([id, s]) => ({
    type: 'Feature' as const,
    properties: { id, color: s.colors?.[0] || '#5eead4', interchange: s.lines.length > 1, disabled: !!s.disabled },
    geometry: { type: 'Point' as const, coordinates: [Number(s.longitude), Number(s.latitude)] },
  })),
};

export default function TehranMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<ml.Map | null>(null);
  const routeMarkers = useRef<ml.Marker[]>([]);
  const placeMarkers = useRef<ml.Marker[]>([]);
  const tempMarker = useRef<ml.Marker | null>(null);
  const pickingRef = useRef<'A' | 'B' | 'P' | null>(null);

  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'route' | 'ai' | 'places' | null>(null);
  const [picking, setPicking] = useState<'A' | 'B' | 'P' | null>(null);

  // top search
  const [sq, setSq] = useState('');
  const [sOpen, setSOpen] = useState(false);

  // endpoints
  const [epA, setEpA] = useState<EP | null>(null);
  const [epB, setEpB] = useState<EP | null>(null);
  const [qA, setQA] = useState('');
  const [qB, setQB] = useState('');
  const [focusEP, setFocusEP] = useState<'A' | 'B' | null>(null);
  const [route, setRoute] = useState<FullRoute | null>(null);

  // saved places
  const [places, setPlaces] = useState<SavedPlace[]>(() => loadPlaces());
  const placesRef = useRef(places);
  const [pName, setPName] = useState('');
  const [pIcon, setPIcon] = useState('📍');
  const [pQuery, setPQuery] = useState('');
  const [pLoc, setPLoc] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [pFocus, setPFocus] = useState(false);

  // AI chat
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [aiQ, setAiQ] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  pickingRef.current = picking;
  placesRef.current = places;
  useEffect(() => { storePlaces(places); }, [places]);

  const geoA = useGeoSearch(qA, focusEP === 'A' && !epA);
  const geoB = useGeoSearch(qB, focusEP === 'B' && !epB);
  const geoP = useGeoSearch(pQuery, pFocus && !pLoc);

  // ---- map init ----
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = new ml.Map({
      container: mapEl.current,
      style: {
        version: 8, name: 'dark',
        sources: { base: { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', 'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'], tileSize: 256, attribution: '© CARTO © OpenStreetMap' } },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
      center: [51.389, 35.7], zoom: 10.6, attributionControl: false,
    });
    m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    m.addControl(new ml.AttributionControl({ compact: true }));

    m.on('load', () => {
      m.addSource('metro-lines', { type: 'geojson', data: lineFeatures });
      m.addLayer({ id: 'metro-lines-casing', type: 'line', source: 'metro-lines', paint: { 'line-color': '#0b0d12', 'line-width': 6, 'line-opacity': .8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addLayer({ id: 'metro-lines-line', type: 'line', source: 'metro-lines', paint: { 'line-color': ['get', 'color'], 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

      m.addSource('metro-stations', { type: 'geojson', data: stationFeatures });
      m.addLayer({
        id: 'stations-layer', type: 'circle', source: 'metro-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'interchange'], 4, 2.5], 14, ['case', ['get', 'interchange'], 8, 5.5]],
          'circle-color': ['case', ['get', 'interchange'], '#ffffff', ['get', 'color']],
          'circle-stroke-width': ['case', ['get', 'interchange'], 2.5, 1.5],
          'circle-stroke-color': ['case', ['get', 'interchange'], '#111', 'rgba(255,255,255,.85)'],
          'circle-opacity': ['case', ['get', 'disabled'], .3, 1],
          'circle-stroke-opacity': ['case', ['get', 'disabled'], .3, 1],
        },
      });

      // route layers (empty until a route exists)
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'metro'], paint: { 'line-color': '#fff', 'line-width': 9, 'line-opacity': .9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'metro'], paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'walk'], paint: { 'line-color': '#5eead4', 'line-width': 3, 'line-dasharray': [1, 2] }, layout: { 'line-cap': 'round' } });

      m.on('mouseenter', 'stations-layer', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'stations-layer', () => { m.getCanvas().style.cursor = ''; });

      m.on('click', e => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ['stations-layer'] });
        const pick = pickingRef.current;
        if (pick) {
          // picking wins over popups; a station hit gives an exact station endpoint
          const hitId = hits.length ? (hits[0].properties!.id as string) : null;
          const ep: EP = hitId
            ? { id: hitId, ...stCoord(hitId), label: faName(hitId) }
            : { lat: e.lngLat.lat, lng: e.lngLat.lng, label: 'نقطه انتخابی روی نقشه' };
          if (pick === 'P') { setPLoc({ lat: ep.lat, lng: ep.lng, label: ep.label }); setPicking(null); setSheet('places'); return; }
          if (pick === 'A') { setEpA(ep); setQA(ep.label); } else { setEpB(ep); setQB(ep.label); }
          setPicking(null); setSheet('route');
          return;
        }
        if (hits.length) openStationPopup(m, hits[0].properties!.id as string);
      });

      map.current = m;
      setReady(true);
      setTimeout(() => m.resize(), 100);
    });
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openStationPopup = (m: ml.Map, id: string) => {
    const s = stations[id];
    if (!s) return;
    const fa = s.translations?.fa || s.name;
    const badges = s.lines.map(l => `<span class="pop-badge" style="background:${lines[l]?.color || '#555'}">${lines[l]?.name?.fa || l}</span>`).join('');
    const body = s.disabled
      ? `<div class="pop-title">${fa}</div><div class="pop-sub">در حال ساخت — هنوز باز نشده</div><div class="pop-badges">${badges}</div>`
      : `<div class="pop-title">${fa}</div><div class="pop-sub">${s.address || 'ایستگاه مترو'}</div><div class="pop-badges">${badges}</div>
         <div class="pop-actions"><button class="pop-from">مبدأ</button><button class="pop-to">مقصد</button></div>`;
    const pop = new ml.Popup({ offset: 12 }).setLngLat([Number(s.longitude), Number(s.latitude)]).setHTML(body).addTo(m);
    const ep: EP = { id, lat: Number(s.latitude), lng: Number(s.longitude), label: fa };
    pop.getElement().querySelector('.pop-from')?.addEventListener('click', () => { setEpA(ep); setQA(fa); pop.remove(); setSheet('route'); });
    pop.getElement().querySelector('.pop-to')?.addEventListener('click', () => { setEpB(ep); setQB(fa); pop.remove(); setSheet('route'); });
  };

  const openPlacePopup = (m: ml.Map, p: SavedPlace) => {
    const body = `<div class="pop-title">${p.icon} ${esc(p.name)}</div><div class="pop-sub">مکان ذخیره‌شده</div>
      <div class="pop-actions"><button class="pop-from">مبدأ</button><button class="pop-to">مقصد</button><button class="pop-del">🗑</button></div>`;
    const pop = new ml.Popup({ offset: 22 }).setLngLat([p.lng, p.lat]).setHTML(body).addTo(m);
    const ep: EP = { lat: p.lat, lng: p.lng, label: p.name };
    pop.getElement().querySelector('.pop-from')?.addEventListener('click', () => { setEpA(ep); setQA(p.name); pop.remove(); setSheet('route'); });
    pop.getElement().querySelector('.pop-to')?.addEventListener('click', () => { setEpB(ep); setQB(p.name); pop.remove(); setSheet('route'); });
    pop.getElement().querySelector('.pop-del')?.addEventListener('click', () => { setPlaces(ps => ps.filter(x => x.id !== p.id)); pop.remove(); });
  };

  // ---- saved-place markers ----
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    placeMarkers.current.forEach(mk => mk.remove());
    placeMarkers.current = places.map(p => {
      const el = document.createElement('div');
      el.className = 'place-marker';
      el.textContent = p.icon;
      el.title = p.name;
      el.addEventListener('click', ev => { ev.stopPropagation(); openPlacePopup(m, p); });
      return new ml.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, ready]);

  // ---- route computation + drawing ----
  useEffect(() => {
    if (!epA || !epB) { setRoute(null); return; }
    setRoute(computeFullRoute(epA, epB));
  }, [epA, epB]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    routeMarkers.current.forEach(mk => mk.remove());
    routeMarkers.current = [];
    const src = m.getSource('route') as ml.GeoJSONSource | undefined;
    if (!src) return;
    if (!epA || !epB) { src.setData({ type: 'FeatureCollection', features: [] }); return; }

    const coord = (id: string): [number, number] => [Number(stations[id].longitude), Number(stations[id].latitude)];
    const features: GeoJSON.Feature[] = [];
    if (route) {
      features.push(...route.metro.legs.map(leg => ({
        type: 'Feature' as const, properties: { kind: 'metro', color: lines[leg.line]?.color || '#5eead4' },
        geometry: { type: 'LineString' as const, coordinates: leg.stationIds.map(coord) },
      })));
      if (route.walkFrom) features.push({ type: 'Feature', properties: { kind: 'walk' }, geometry: { type: 'LineString', coordinates: [[epA.lng, epA.lat], coord(route.walkFrom.to)] } });
      if (route.walkTo) features.push({ type: 'Feature', properties: { kind: 'walk' }, geometry: { type: 'LineString', coordinates: [coord(route.walkTo.from), [epB.lng, epB.lat]] } });
    } else {
      // no metro route → dashed direct walking line
      features.push({ type: 'Feature', properties: { kind: 'walk' }, geometry: { type: 'LineString', coordinates: [[epA.lng, epA.lat], [epB.lng, epB.lat]] } });
    }
    src.setData({ type: 'FeatureCollection', features });

    for (const [ep, color] of [[epA, '#22c55e'], [epB, '#ef4444']] as const) {
      const el = document.createElement('div');
      el.style.cssText = `width:16px;height:16px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5)`;
      routeMarkers.current.push(new ml.Marker({ element: el }).setLngLat([ep.lng, ep.lat]).addTo(m));
    }
    const b = new ml.LngLatBounds();
    features.forEach(f => (f.geometry as GeoJSON.LineString).coordinates.forEach(c => b.extend(c as [number, number])));
    m.fitBounds(b, { padding: { top: 90, bottom: 90, left: 50, right: 50 }, duration: 700 });
  }, [route, epA, epB, ready]);

  // ---- endpoint helpers ----
  const setEndpoint = (which: 'A' | 'B', ep: EP | null, text: string) => {
    if (which === 'A') { setEpA(ep); setQA(text); } else { setEpB(ep); setQB(text); }
    setFocusEP(null);
  };
  const geoloc = (): Promise<EP | null> => new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'موقعیت من' }),
      () => res(null), { enableHighAccuracy: true, timeout: 8000 });
  });
  const useMyLocation = async () => {
    const ep = await geoloc();
    if (ep) setEndpoint('A', ep, ep.label);
    else alert('دسترسی به موقعیت مکانی ممکن نیست');
  };
  const swap = () => {
    setEpA(epB); setEpB(epA);
    setQA(qB); setQB(qA);
  };
  const clearRoute = () => { setEpA(null); setEpB(null); setQA(''); setQB(''); setRoute(null); };

  const matchPlaces = (q: string): SavedPlace[] => {
    const qn = normalize(q.trim());
    if (!qn) return places.slice(0, 6);
    return places.filter(p => normalize(p.name).includes(qn)).slice(0, 4);
  };

  const savePlace = () => {
    if (!pName.trim() || !pLoc) return;
    setPlaces(ps => [...ps, { id: newPlaceId(), name: pName.trim(), icon: pIcon, lat: pLoc.lat, lng: pLoc.lng }]);
    setPName(''); setPQuery(''); setPLoc(null); setPIcon('📍');
  };

  // ---- AI: place resolution + map commands ----
  /** saved place → metro station → Nominatim, in that order. */
  const resolvePlace = useCallback(async (name: string): Promise<EP | null> => {
    const raw = (name || '').trim();
    if (!raw) return null;
    const n = normalize(raw);
    if (n.includes('موقعيت من') || /my ?location|current location|here/i.test(raw)) return geoloc();
    const p = placesRef.current.find(x => normalize(x.name) === n)
      || placesRef.current.find(x => normalize(x.name).includes(n) || n.includes(normalize(x.name)));
    if (p) return { lat: p.lat, lng: p.lng, label: p.name };
    const st = searchStations(raw)[0];
    if (st) return { id: st.id, ...stCoord(st.id), label: st.fa };
    const g = (await geocode(raw).catch(() => [] as GeoResult[]))[0];
    if (g) return { lat: g.lat, lng: g.lng, label: g.label };
    return null;
  }, []);

  const dropTempMarker = (ep: EP) => {
    const m = map.current;
    if (!m) return;
    tempMarker.current?.remove();
    const el = document.createElement('div');
    el.className = 'place-marker temp';
    el.textContent = '📍';
    tempMarker.current = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([ep.lng, ep.lat]).addTo(m);
  };

  /** Execute one <map> command emitted by the model; returns a status chip for the chat. */
  const runCommand = async (cmd: { action?: string; from?: string; to?: string; place?: string; name?: string }): Promise<string> => {
    if (cmd.action === 'route') {
      const [a, b] = await Promise.all([resolvePlace(cmd.from || 'موقعیت من'), resolvePlace(cmd.to || '')]);
      if (!a) return `«${cmd.from || 'موقعیت من'}» پیدا نشد — مبدأ را دقیق‌تر بگویید.`;
      if (!b) return `«${cmd.to}» پیدا نشد — مقصد را دقیق‌تر بگویید.`;
      setEndpoint('A', a, a.label);
      setEndpoint('B', b, b.label);
      setTimeout(() => setSheet('route'), 700);
      return `🗺️ مسیر «${a.label}» ← «${b.label}» روی نقشه نمایش داده شد`;
    }
    if (cmd.action === 'show') {
      const p = await resolvePlace(cmd.place || cmd.name || '');
      if (!p) return `«${cmd.place || cmd.name}» پیدا نشد.`;
      map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14.5, duration: 800 });
      if (p.id) { if (map.current) openStationPopup(map.current, p.id); } else dropTempMarker(p);
      setTimeout(() => setSheet(null), 700);
      return `📍 «${p.label}» روی نقشه نمایش داده شد`;
    }
    if (cmd.action === 'save') {
      const p = await resolvePlace(cmd.place || '');
      if (!p) return `مکان «${cmd.place}» برای ذخیره پیدا نشد.`;
      const nm = (cmd.name || p.label).trim();
      setPlaces(ps => [...ps, { id: newPlaceId(), name: nm, icon: '📍', lat: p.lat, lng: p.lng }]);
      return `⭐ «${nm}» به مکان‌های شما اضافه شد`;
    }
    return '';
  };

  const routeContext = useCallback(() => {
    if (!route) return 'کاربر هنوز مسیری انتخاب نکرده است.';
    const legs = route.metro.legs.map(l =>
      `${lines[l.line]?.name?.fa || l.line}: ${l.stationIds.map(faName).join(' → ')}`).join('\n');
    return `مسیر فعلی کاربر:\n${route.walkFrom ? `پیاده‌روی ${route.walkFrom.min} دقیقه تا ایستگاه ${faName(route.walkFrom.to)}\n` : ''}${legs}\n${route.walkTo ? `پیاده‌روی ${route.walkTo.min} دقیقه از ایستگاه ${faName(route.walkTo.from)} تا مقصد\n` : ''}زمان کل تقریبی: ${route.totalMin} دقیقه، ${route.metro.totalTransfers} تعویض خط.`;
  }, [route]);

  const sysPrompt = useCallback(() => {
    const names = places.map(p => `«${p.name}»`).join('، ') || 'هیچ';
    return `تو دستیار مسیریابی مترو تهران در اپ «تهران‌یاب» هستی و کنترل نقشه اپ را در اختیار داری. کوتاه، دقیق و به فارسی جواب بده. شبکه مترو تهران ۷ خط دارد.
مکان‌های ذخیره‌شده کاربر: ${names}.
${routeContext()}

کنترل نقشه — وقتی کاربر مسیر می‌خواهد، اول یک جمله کوتاه بگو و بعد در آخرین خط پاسخ دقیقاً یک دستور با این قالب بنویس:
<map>{"action":"route","from":"مبدأ","to":"مقصد"}</map>
- اگر کاربر مبدأ نگفت، از "موقعیت من" استفاده کن.
- نام مکان را همان‌طور که کاربر گفت بنویس: مکان ذخیره‌شده، نام ایستگاه مترو، یا هر مکان معروف تهران (مثل «برج میلاد»)؛ اپ خودش پیدایش می‌کند.
نمایش یک مکان روی نقشه: <map>{"action":"show","place":"نام"}</map>
ذخیره یک مکان جدید: <map>{"action":"save","name":"نام دلخواه","place":"مکان یا آدرس"}</map>
جز این سه حالت هرگز تگ <map> ننویس و داخل آن فقط JSON معتبر بگذار.`;
  }, [places, routeContext]);

  const askAI = async () => {
    const q = aiQ.trim();
    if (!q || aiBusy) return;
    setAiQ('');
    const history: ChatMsg[] = [...chat, { role: 'user', content: q }];
    setChat([...history, { role: 'assistant', content: '' }]);
    setAiBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: sysPrompt() },
            ...history.filter(m => m.role !== 'action').slice(-8).map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines_ = buf.split('\n');
        buf = lines_.pop()!;
        for (const ln of lines_) {
          if (!ln.startsWith('data: ') || ln === 'data: [DONE]') continue;
          try {
            const delta = JSON.parse(ln.slice(6)).choices?.[0]?.delta?.content;
            if (delta) { text += delta; setChat([...history, { role: 'assistant', content: stripCmd(text) }]); }
          } catch { /* partial json */ }
        }
      }
      // extract + run map commands, hidden from the bubble
      const cmds = [...text.matchAll(/<map>([\s\S]*?)<\/map>/g)]
        .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
        .filter(Boolean) as { action?: string }[];
      const shown = stripCmd(text);
      const base: ChatMsg[] = shown ? [...history, { role: 'assistant', content: shown }] : [...history];
      setChat(base);
      if (!shown && !cmds.length) setChat([...history, { role: 'assistant', content: 'پاسخی دریافت نشد.' }]);
      for (const c of cmds) {
        const note = await runCommand(c);
        if (note) setChat(prev => [...prev, { role: 'action', content: note }]);
      }
    } catch {
      setChat([...history, { role: 'assistant', content: 'خطا در ارتباط با دستیار. کلید Cerebras را در .env بررسی کنید.' }]);
    } finally {
      setAiBusy(false);
    }
  };
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // ---- render helpers ----
  const epInput = (which: 'A' | 'B') => {
    const q = which === 'A' ? qA : qB;
    const setQ = which === 'A' ? setQA : setQB;
    const stationResults = focusEP === which ? searchStations(q) : [];
    const placeResults = focusEP === which ? matchPlaces(q) : [];
    const geoResults = which === 'A' ? geoA : geoB;
    const open = focusEP === which && (placeResults.length > 0 || stationResults.length > 0 || geoResults.length > 0);
    return (
      <div className="ep-input">
        <input value={q} placeholder={which === 'A' ? 'مبدأ — ایستگاه، مکان یا آدرس' : 'مقصد — ایستگاه، مکان یا آدرس'}
          onChange={e => { setQ(e.target.value); (which === 'A' ? setEpA : setEpB)(null); }}
          onFocus={() => setFocusEP(which)} onBlur={() => setTimeout(() => setFocusEP(f => f === which ? null : f), 200)} />
        {open && (
          <div className="s-drop" style={{ zIndex: 60 }}>
            {placeResults.map(p => (
              <div key={p.id} className="s-item" onMouseDown={() => setEndpoint(which, { lat: p.lat, lng: p.lng, label: p.name }, p.name)}>
                <span className="em">{p.icon}</span>
                <span className="nm">{p.name}</span>
                <span className="ln">مکان ذخیره‌شده</span>
              </div>
            ))}
            {stationResults.map(r => (
              <div key={r.id} className="s-item" onMouseDown={() => setEndpoint(which, { id: r.id, ...stCoord(r.id), label: r.fa }, r.fa)}>
                <span className="dot" style={{ background: r.color }} />
                <span className="nm">{r.fa}</span>
                <span className="ln">{r.lineNames}</span>
              </div>
            ))}
            {geoResults.map((g, i) => (
              <div key={i} className="s-item" onMouseDown={() => setEndpoint(which, { lat: g.lat, lng: g.lng, label: g.label }, g.label)}>
                <span className="em">📍</span>
                <span className="nm">{g.label}</span>
                <span className="ln">{g.sub}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const searchResults = sOpen ? searchStations(sq) : [];
  const searchPlaces = sOpen && sq.trim() ? matchPlaces(sq) : [];
  const directKm = epA && epB ? haversineKm(epA.lat, epA.lng, epB.lat, epB.lng) : 0;

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      <div id="map" ref={mapEl} />

      {/* top bar */}
      <div className="top">
        <div className="logo"><span>تهران</span>‌یاب</div>
        <div className="s-wrap">
          <input value={sq} placeholder="جستجوی ایستگاه یا مکان..." onChange={e => { setSq(e.target.value); setSOpen(true); }}
            onFocus={() => setSOpen(true)} onBlur={() => setTimeout(() => setSOpen(false), 200)} />
          <svg className="s-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          {(searchResults.length > 0 || searchPlaces.length > 0) && (
            <div className="s-drop">
              {searchPlaces.map(p => (
                <div key={p.id} className="s-item" onMouseDown={() => {
                  setSq(p.name); setSOpen(false);
                  map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14.5, duration: 600 });
                  if (map.current) openPlacePopup(map.current, p);
                }}>
                  <span className="em">{p.icon}</span>
                  <span className="nm">{p.name}</span>
                  <span className="ln">مکان ذخیره‌شده</span>
                </div>
              ))}
              {searchResults.map(r => (
                <div key={r.id} className="s-item" onMouseDown={() => {
                  setSq(r.fa); setSOpen(false);
                  const s = stations[r.id];
                  map.current?.flyTo({ center: [Number(s.longitude), Number(s.latitude)], zoom: 14.5, duration: 600 });
                  if (map.current) openStationPopup(map.current, r.id);
                }}>
                  <span className="dot" style={{ background: r.color }} />
                  <span className="nm">{r.fa}</span>
                  <span className="ln">{r.lineNames}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {picking && <div className="hint">روی نقشه بزنید تا {picking === 'A' ? 'مبدأ' : picking === 'B' ? 'مقصد' : 'مکان'} انتخاب شود</div>}

      {/* floating actions */}
      <div className="fabs">
        <button className="fab primary" onClick={() => setSheet('route')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>
          مسیریابی
        </button>
        <button className="fab" onClick={() => setSheet('ai')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3c-4.97 0-9 3.58-9 8 0 1.9.74 3.64 1.98 5.01L4 21l4.36-1.45A10.7 10.7 0 0 0 12 20c4.97 0 9-3.58 9-8s-4.03-9-9-9z" /></svg>
          دستیار
        </button>
        <button className="fab" onClick={() => setSheet('places')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          مکان‌ها
        </button>
      </div>

      <div className={`overlay ${sheet ? 'show' : ''}`} onClick={() => setSheet(null)} />

      {/* route sheet */}
      <div className={`sheet ${sheet === 'route' ? 'show' : ''}`}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">مسیریابی مترو</div>
          <button className="sheet-close" onClick={() => setSheet(null)}>✕</button>
        </div>
        <div className="sheet-body">
          <div className="ep">
            <span className="ep-dot" style={{ background: '#22c55e' }} />
            {epInput('A')}
          </div>
          <div className="ep">
            <span className="ep-dot" style={{ background: '#ef4444' }} />
            {epInput('B')}
            <button className="swap" title="جابجایی" onClick={swap}>⇅</button>
          </div>
          <div className="ep-btns">
            <button className="chip" onClick={useMyLocation}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
              موقعیت من
            </button>
            <button className={`chip ${picking === 'A' ? 'on' : ''}`} onClick={() => { setPicking(picking === 'A' ? null : 'A'); setSheet(null); }}>مبدأ از نقشه</button>
            <button className={`chip ${picking === 'B' ? 'on' : ''}`} onClick={() => { setPicking(picking === 'B' ? null : 'B'); setSheet(null); }}>مقصد از نقشه</button>
            {(epA || epB) && <button className="chip" onClick={clearRoute}>پاک کردن</button>}
          </div>

          {epA && epB && !route && (
            <div className="walk col">
              <div>🚶 <span>مسیر مترویی لازم نیست یا پیدا نشد — فاصله مستقیم حدود <b>{faNum(directKm.toFixed(1))}</b> کیلومتر ({faNum(walkMinutes(directKm))} دقیقه پیاده)</span></div>
              <a className="gpill" target="_blank" rel="noreferrer" href={gmapsUrl(epA, epB, 'walking')}>🗺️ مسیر پیاده در Google Maps</a>
            </div>
          )}

          {route && epA && epB && (
            <>
              <div className="stats">
                <div className="stat"><b>{faNum(route.totalMin)}</b><span>دقیقه</span></div>
                <div className="stat"><b>{faNum(route.metro.totalStations)}</b><span>ایستگاه</span></div>
                <div className="stat"><b>{faNum(route.metro.totalTransfers)}</b><span>تعویض خط</span></div>
              </div>

              <a className="gpill wide" target="_blank" rel="noreferrer" href={gmapsUrl(epA, epB, 'transit')}>🗺️ مشاهده کل مسیر در Google Maps</a>

              {route.walkFrom && (
                <div className="walk col">
                  <div>🚶 <span>پیاده‌روی تا ایستگاه <b>{faName(route.walkFrom.to)}</b> — حدود <b>{faNum(route.walkFrom.min)}</b> دقیقه ({faNum(route.walkFrom.km.toFixed(1))} کیلومتر)</span></div>
                  <a className="gpill" target="_blank" rel="noreferrer" href={gmapsUrl(epA, stCoord(route.walkFrom.to), 'walking')}>🗺️ مسیر پیاده در Google Maps</a>
                </div>
              )}

              {route.metro.legs.map((leg, i) => {
                const color = lines[leg.line]?.color || '#5eead4';
                const name = lines[leg.line]?.name?.fa || leg.line;
                const dir = leg.stationIds.length > 1 ? legDirection(leg.line, leg.stationIds[0], leg.stationIds[1]) : null;
                const mids = leg.stationIds.slice(1, -1);
                return (
                  <div key={i}>
                    {i > 0 && (
                      <div className="transfer">↔ تعویض خط در ایستگاه <b>{faName(leg.stationIds[0])}</b> — {name}</div>
                    )}
                    <div className="leg" style={{ borderColor: color }}>
                      <div className="leg-head">
                        <span className="leg-badge" style={{ background: color }}>{name}</span>
                        {dir && <span className="leg-dir">به سمت {dir}</span>}
                      </div>
                      <div className="leg-st end" style={{ color }}><span className="tick" />{faName(leg.stationIds[0])}</div>
                      {mids.length > 3 ? (
                        <details>
                          <summary className="leg-more">{faNum(mids.length)} ایستگاه میانی</summary>
                          {mids.map(s => <div key={s} className="leg-st"><span className="tick" />{faName(s)}</div>)}
                        </details>
                      ) : mids.map(s => <div key={s} className="leg-st"><span className="tick" />{faName(s)}</div>)}
                      <div className="leg-st end" style={{ color }}><span className="tick" />{faName(leg.stationIds[leg.stationIds.length - 1])}</div>
                    </div>
                  </div>
                );
              })}

              {route.walkTo && (
                <div className="walk col">
                  <div>🚶 <span>پیاده‌روی از ایستگاه <b>{faName(route.walkTo.from)}</b> تا مقصد — حدود <b>{faNum(route.walkTo.min)}</b> دقیقه ({faNum(route.walkTo.km.toFixed(1))} کیلومتر)</span></div>
                  <a className="gpill" target="_blank" rel="noreferrer" href={gmapsUrl(stCoord(route.walkTo.from), epB, 'walking')}>🗺️ مسیر پیاده در Google Maps</a>
                </div>
              )}

              <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => { setSheet('ai'); }}>
                💬 سوال درباره این مسیر از دستیار
              </button>
            </>
          )}
        </div>
      </div>

      {/* places sheet */}
      <div className={`sheet ${sheet === 'places' ? 'show' : ''}`}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">مکان‌های من</div>
          <button className="sheet-close" onClick={() => setSheet(null)}>✕</button>
        </div>
        <div className="sheet-body">
          {places.length === 0 && (
            <div className="walk">مکانی مثل «دانشگاه» یا «خانه خاله» ذخیره کنید تا در مسیریابی و دستیار هوشمند با نامش استفاده شود.</div>
          )}
          {places.map(p => (
            <div key={p.id} className="place-row">
              <button className="p-main" onClick={() => { map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14.5, duration: 600 }); setSheet(null); }}>
                <span className="p-ic">{p.icon}</span>
                <span className="p-nm">{p.name}</span>
              </button>
              <button className="p-act from" onClick={() => { setEndpoint('A', { lat: p.lat, lng: p.lng, label: p.name }, p.name); setSheet('route'); }}>مبدأ</button>
              <button className="p-act to" onClick={() => { setEndpoint('B', { lat: p.lat, lng: p.lng, label: p.name }, p.name); setSheet('route'); }}>مقصد</button>
              <button className="p-act del" title="حذف" onClick={() => setPlaces(ps => ps.filter(x => x.id !== p.id))}>🗑</button>
            </div>
          ))}

          <div className="sec-title">افزودن مکان جدید</div>
          <input className="fld" value={pName} placeholder="نام مکان — مثلاً: خانه خاله" onChange={e => setPName(e.target.value)} />
          <div className="icon-row">
            {PLACE_ICONS.map(ic => (
              <button key={ic} className={`icon-btn ${pIcon === ic ? 'on' : ''}`} onClick={() => setPIcon(ic)}>{ic}</button>
            ))}
          </div>
          <div className="ep-input" style={{ marginBottom: 8 }}>
            <input className="fld" value={pQuery} placeholder="جستجوی آدرس یا ایستگاه..."
              onChange={e => { setPQuery(e.target.value); setPLoc(null); }}
              onFocus={() => setPFocus(true)} onBlur={() => setTimeout(() => setPFocus(false), 200)} />
            {pFocus && !pLoc && (searchStations(pQuery).length > 0 || geoP.length > 0) && (
              <div className="s-drop" style={{ zIndex: 60 }}>
                {searchStations(pQuery).slice(0, 4).map(r => (
                  <div key={r.id} className="s-item" onMouseDown={() => { setPLoc({ ...stCoord(r.id), label: r.fa }); setPQuery(r.fa); }}>
                    <span className="dot" style={{ background: r.color }} />
                    <span className="nm">{r.fa}</span>
                    <span className="ln">{r.lineNames}</span>
                  </div>
                ))}
                {geoP.map((g, i) => (
                  <div key={i} className="s-item" onMouseDown={() => { setPLoc({ lat: g.lat, lng: g.lng, label: g.label }); setPQuery(g.label); }}>
                    <span className="em">📍</span>
                    <span className="nm">{g.label}</span>
                    <span className="ln">{g.sub}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ep-btns">
            <button className="chip" onClick={async () => { const ep = await geoloc(); if (ep) { setPLoc(ep); setPQuery(ep.label); } else alert('دسترسی به موقعیت مکانی ممکن نیست'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
              موقعیت من
            </button>
            <button className={`chip ${picking === 'P' ? 'on' : ''}`} onClick={() => { setPicking(picking === 'P' ? null : 'P'); setSheet(null); }}>انتخاب از نقشه</button>
          </div>
          {pLoc && <div className="loc-chip">📍 {pLoc.label}</div>}
          <button className="btn btn-primary" disabled={!pName.trim() || !pLoc} onClick={savePlace}>ذخیره مکان</button>
        </div>
      </div>

      {/* AI sheet */}
      <div className={`sheet ${sheet === 'ai' ? 'show' : ''}`}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">دستیار هوشمند</div>
          <button className="sheet-close" onClick={() => setSheet(null)}>✕</button>
        </div>
        <div className="sheet-body chat">
          {chat.length === 0 && (
            <div className="walk">دستیار نقشه را کنترل می‌کند — بگویید: «از دانشگاهم تا برج میلاد چطور برم؟»، «ایستگاه تجریش را نشانم بده» یا «کافه X را با نام پاتوق ذخیره کن».</div>
          )}
          {chat.map((msg, i) => (
            msg.role === 'action'
              ? <div key={i} className="msg action">{msg.content}</div>
              : <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.content || <span className="typing"><i /><i /><i /></span>}
                </div>
          ))}
          <div ref={chatEnd} />
        </div>
        <div className="chat-row">
          <input value={aiQ} placeholder="مثلاً: از دانشگاه تا خانه خاله..." onChange={e => setAiQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askAI()} disabled={aiBusy} />
          <button className="chat-send" onClick={askAI} disabled={aiBusy || !aiQ.trim()}>➤</button>
        </div>
      </div>
    </div>
  );
}
