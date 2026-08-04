import { Graph, RouteResult, RouteStep, StationsMap } from '@/types/tehgo-metro';

export function findRoutes(
  graph: Graph,
  stations: StationsMap,
  from: string,
  to: string,
  maxRoutes: number = 5
): RouteResult[] {
  if (from === to) return [];
  const allRoutes: RouteResult[] = [];
  
  const findAllPaths = (
    current: string, target: string, visited: Set<string>,
    path: string[], lines: string[], currentLine: string, transfers: number
  ) => {
    if (current === target) {
      const steps: RouteStep[] = [];
      let prevLine = '';
      for (let i = 0; i < path.length; i++) {
        const stationId = path[i];
        const station = stations[stationId];
        if (!station) continue;
        const edge = i > 0 ? graph[path[i - 1]]?.find(e => e.to === stationId) : null;
        const line = edge?.line || station.lines?.[0] || '';
        const isTransfer = line !== prevLine && prevLine !== '';
        if (isTransfer && steps.length > 0) steps[steps.length - 1].transferTo = line;
        steps.push({ stationId, station, line, isTransfer });
        prevLine = line;
      }
      const uniqueLines = Array.from(new Set(steps.map(s => s.line).filter(Boolean)));
      allRoutes.push({ steps, totalStations: path.length, totalTransfers: uniqueLines.length - 1, lines: uniqueLines });
      return;
    }
    if (path.length > 30 || transfers > 4) return;
    const edges = graph[current] || [];
    const sortedEdges = [...edges].sort((a, b) => {
      const aIsSameLine = a.line === currentLine ? 0 : 1;
      const bIsSameLine = b.line === currentLine ? 0 : 1;
      return aIsSameLine - bIsSameLine;
    });
    for (const edge of sortedEdges) {
      if (!visited.has(edge.to) && stations[edge.to]) {
        const newTransfers = currentLine && edge.line !== currentLine ? transfers + 1 : transfers;
        const newVisited = new Set(visited);
        newVisited.add(edge.to);
        const newLines = edge.line !== currentLine ? [...lines, edge.line] : lines;
        findAllPaths(edge.to, target, newVisited, [...path, edge.to], newLines, edge.line, newTransfers);
      }
    }
  };

  const firstStation = stations[from];
  const initialLine = firstStation?.lines?.[0] || '';
  findAllPaths(from, to, new Set([from]), [from], [initialLine], initialLine, 0);

  const uniqueRoutes = allRoutes.filter((route, index, self) => {
    const pathKey = route.steps.map(s => s.stationId).join('-');
    return index === self.findIndex(r => r.steps.map(s => s.stationId).join('-') === pathKey);
  });

  uniqueRoutes.sort((a, b) => {
    if (a.totalTransfers !== b.totalTransfers) return a.totalTransfers - b.totalTransfers;
    return a.totalStations - b.totalStations;
  });

  return uniqueRoutes.slice(0, maxRoutes);
}
