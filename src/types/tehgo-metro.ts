export interface GraphEdge { from: string; to: string; line: string; weight: number; }
export type Graph = Record<string, GraphEdge[]>;

export interface Station {
  id: string; name: string; translations: { fa: string };
  lines: string[]; longitude: string; latitude: string;
  colors: string[]; disabled: boolean; relations: string[];
}
export type StationsMap = Record<string, Station>;

export interface RouteStep { stationId: string; station: Station; line: string; isTransfer: boolean; transferTo?: string; }
export interface RouteResult { steps: RouteStep[]; totalStations: number; totalTransfers: number; lines: string[]; }
