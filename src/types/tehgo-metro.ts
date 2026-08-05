export interface GraphEdge { from: string; to: string; line: string; weight: number; }
export type Graph = Record<string, GraphEdge[]>;

export interface Station {
  id: string; name: string; translations: { fa: string };
  lines: string[]; longitude: string; latitude: string;
  address?: string; colors: string[]; disabled: boolean; relations: string[];
}
export type StationsMap = Record<string, Station>;

export interface LineInfo { id: string; name: { fa: string; en: string }; color: string; }
export type LinesMap = Record<string, LineInfo>;

export interface RouteStep { stationId: string; line: string; isTransfer: boolean; transferTo?: string; }

/** A contiguous ride on one line, for grouped timeline rendering. */
export interface RouteLeg { line: string; stationIds: string[]; }

export interface RouteResult {
  steps: RouteStep[];
  legs: RouteLeg[];
  totalStations: number;
  totalTransfers: number;
  lines: string[];
  /** estimated minutes on the metro (hops + transfer penalties) */
  minutes: number;
}
