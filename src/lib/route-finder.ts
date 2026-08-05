import { Graph, RouteLeg, RouteResult, RouteStep, Station, StationsMap } from '@/types/tehgo-metro';

// ponytail: tuned constants, not config — tweak here if estimates feel off
const MIN_PER_HOP = 2;      // avg minutes between adjacent stations
const MIN_PER_TRANSFER = 5; // walking between platforms + waiting

/** Upstream graph.json misses some reverse edges — metro lines run both ways, so mirror every edge. */
export function makeBidirectional(graph: Graph): Graph {
  const g: Graph = {};
  for (const [from, edges] of Object.entries(graph)) (g[from] ??= []).push(...edges);
  for (const edges of Object.values(graph))
    for (const e of edges) {
      const back = (g[e.to] ??= []);
      if (!back.some(b => b.to === e.from && b.line === e.line))
        back.push({ from: e.to, to: e.from, line: e.line, weight: e.weight });
    }
  return g;
}

/** Dijkstra over (station,line) states so line changes cost a transfer penalty. */
export function findRoute(graph: Graph, stations: StationsMap, from: string, to: string): RouteResult | null {
  if (from === to || !stations[from] || !stations[to]) return null;

  // state key: `${station}|${line}` — cost in minutes
  const dist = new Map<string, number>();
  const prev = new Map<string, string>(); // state -> previous state
  // simple sorted-array PQ; ponytail: n≈300 states, heap not worth it
  const queue: [number, string][] = [];
  const push = (cost: number, key: string) => {
    let i = queue.findIndex(q => q[0] > cost);
    if (i < 0) i = queue.length;
    queue.splice(i, 0, [cost, key]);
  };

  const start = `${from}|`;
  dist.set(start, 0);
  push(0, start);

  let bestEnd: string | null = null;
  while (queue.length) {
    const [cost, key] = queue.shift()!;
    if (cost > (dist.get(key) ?? Infinity)) continue;
    const [station, line] = key.split('|');
    if (station === to) { bestEnd = key; break; }
    for (const edge of graph[station] || []) {
      if (!stations[edge.to]) continue;
      const transfer = line !== '' && edge.line !== line;
      if (transfer && stations[station]?.disabled) continue; // can't change lines at a closed station
      const nCost = cost + MIN_PER_HOP * edge.weight + (transfer ? MIN_PER_TRANSFER : 0);
      const nKey = `${edge.to}|${edge.line}`;
      if (nCost < (dist.get(nKey) ?? Infinity)) {
        dist.set(nKey, nCost);
        prev.set(nKey, key);
        push(nCost, nKey);
      }
    }
  }
  if (!bestEnd) return null;

  // walk back
  const chain: { stationId: string; line: string }[] = [];
  for (let k: string | undefined = bestEnd; k; k = prev.get(k)) {
    const [stationId, line] = k.split('|');
    chain.unshift({ stationId, line });
  }
  // first state has no line — inherit the first ride's line
  if (chain.length > 1 && !chain[0].line) chain[0].line = chain[1].line;

  const steps: RouteStep[] = [];
  const legs: RouteLeg[] = [];
  let prevLine = '';
  for (const { stationId, line } of chain) {
    const isTransfer = prevLine !== '' && line !== prevLine;
    if (isTransfer && steps.length) steps[steps.length - 1].transferTo = line;
    steps.push({ stationId, line, isTransfer });
    if (!legs.length || line !== prevLine) {
      // transfer station belongs to both legs so each leg renders complete
      legs.push({ line, stationIds: legs.length ? [steps[steps.length - 2].stationId] : [] });
    }
    legs[legs.length - 1].stationIds.push(stationId);
    prevLine = line;
  }
  const lines = legs.map(l => l.line);
  const transfers = lines.length - 1;
  return {
    steps, legs, lines,
    totalStations: chain.length,
    totalTransfers: transfers,
    minutes: Math.round((chain.length - 1) * MIN_PER_HOP + transfers * MIN_PER_TRANSFER),
  };
}

const R = 6371; // km
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const d = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * d) / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lng2 - lng1) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestStations(stations: StationsMap, lat: number, lng: number, n = 3): { station: Station; id: string; km: number }[] {
  return Object.entries(stations)
    .filter(([, s]) => !s.disabled)
    .map(([id, s]) => ({ id, station: s, km: haversineKm(lat, lng, Number(s.latitude), Number(s.longitude)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

export const walkMinutes = (km: number) => Math.round((km / 4.5) * 60); // 4.5 km/h walking
