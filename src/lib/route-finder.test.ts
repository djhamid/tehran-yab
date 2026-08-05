// Run: npx tsx src/lib/route-finder.test.ts
import graph from '../data/graph.json';
import stations from '../data/stations.json';
import { findRoute, makeBidirectional, nearestStations } from './route-finder';
import type { Graph, StationsMap } from '@/types/tehgo-metro';

const g = makeBidirectional(graph as unknown as Graph);
const s = stations as unknown as StationsMap;

// Tajrish (L1 north) -> Sadeghiyeh (L2/L5 west): must transfer at least once
const r1 = findRoute(g, s, 'tajrish', 'tehran_sadeghiyeh')!;
console.assert(r1 && r1.totalTransfers >= 1 && r1.totalTransfers <= 2, 'tajrish->sadeghiyeh transfers', r1?.totalTransfers);
console.assert(r1.steps[0].stationId === 'tajrish' && r1.steps.at(-1)!.stationId === 'tehran_sadeghiyeh', 'endpoints');

// same-line trip: zero transfers
const r2 = findRoute(g, s, 'tajrish', 'shahid_haghani')!;
console.assert(r2.totalTransfers === 0, 'same line should be 0 transfers', r2?.lines);

// legs cover all steps, adjacent legs share the transfer station
const r3 = findRoute(g, s, 'azadegan', 'farhangsara')!;
for (let i = 1; i < r3.legs.length; i++)
  console.assert(r3.legs[i].stationIds[0] === r3.legs[i - 1].stationIds.at(-1), 'legs chained');

// no route to self, unknown ids
console.assert(findRoute(g, s, 'tajrish', 'tajrish') === null, 'self');
console.assert(findRoute(g, s, 'nope', 'tajrish') === null, 'unknown');

// every ACTIVE station reachable from tajrish (connected network)
let fails = 0;
for (const [id, st] of Object.entries(s)) {
  if (id === 'tajrish' || st.disabled) continue;
  if (!findRoute(g, s, 'tajrish', id)) { fails++; console.log('UNREACHABLE:', id); }
}
console.assert(fails === 0, `${fails} unreachable stations`);

// nearest station to Azadi Tower ≈ meydan_e_azadi
const near = nearestStations(s, 35.6997, 51.3380);
console.assert(near[0].id.includes('azadi'), 'nearest to Azadi Tower', near[0].id, near[0].km.toFixed(2));

console.log('route-finder: all checks passed.', { r1: { transfers: r1.totalTransfers, min: r1.minutes, stations: r1.totalStations } });
