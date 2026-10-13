export type Point = [number, number, number];
export interface Room {
  id: string;
  name: string;
  category: string;
  description: string;
  aliases: string[];
  floor: number;
  position: Point;
  size: [number, number];
  footprint?: [number, number][];
  node: string;
}
export interface NavNode {
  id: string;
  floor: number;
  position: Point;
  label: string;
  checkpoint?: string;
  exit?: boolean;
  assembly?: boolean;
  refuge?: boolean;
}
export interface NavEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  kind: 'corridor' | 'door' | 'stairs' | 'elevator' | 'outside';
  accessible: boolean;
  evacuation: boolean;
}
export interface Building {
  id: string;
  name: string;
  version: string;
  schemaVersion: number;
  reviewDate: string;
  floors: { id: number; name: string; height: number }[];
  rooms: Room[];
  nodes: NavNode[];
  edges: NavEdge[];
  model: string;
  provenance?: { layoutStatus: string; layoutNote: string; sources: string[] };
  instructions: { assistance: string; emergency: string };
}
export interface Checkpoint {
  v: 1;
  building: string;
  checkpoint: string;
  wifi?: { ssid: string; password: string };
}
export interface Route {
  nodes: NavNode[];
  edges: NavEdge[];
  distance: number;
}
export interface Manifest {
  buildingId: string;
  version: string;
  schemaVersion: 1;
  reviewDate: string;
  aiModel: string;
  coordinates: string;
  files: Record<string, { sha256: string; size: number }>;
}
export interface StoredPackage {
  building: Building;
  manifest: Manifest;
  files: Record<string, Uint8Array>;
  installedAt: string;
}
export interface NativeBridge {
  postMessage(message: string): void;
}
declare global {
  interface Window {
    ReactNativeWebView?: NativeBridge;
  }
}
