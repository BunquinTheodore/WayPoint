import type { Building, Route } from './types';

export function route(
  building: Building,
  start: string,
  destination: string,
  options: { accessible?: boolean; evacuation?: boolean; blocked?: Set<string> } = {},
): Route | null {
  if (
    !building.nodes.some((n) => n.id === start) ||
    !building.nodes.some((n) => n.id === destination)
  )
    return null;
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { node: string; edge: (typeof building.edges)[number] }>();
  const remaining = new Set(building.nodes.map((n) => n.id));
  while (remaining.size) {
    let current: string | undefined;
    let min = Infinity;
    for (const id of remaining) {
      const d = distances.get(id) ?? Infinity;
      if (d < min) {
        min = d;
        current = id;
      }
    }
    if (!current) break;
    remaining.delete(current);
    if (current === destination) break;
    for (const edge of building.edges) {
      if (
        options.blocked?.has(edge.id) ||
        (options.accessible && !edge.accessible) ||
        (options.evacuation && (!edge.evacuation || edge.kind === 'elevator'))
      )
        continue;
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (!next || !remaining.has(next)) continue;
      const d = min + edge.distance;
      if (d < (distances.get(next) ?? Infinity)) {
        distances.set(next, d);
        previous.set(next, { node: current, edge });
      }
    }
  }
  if (!distances.has(destination)) return null;
  const ids = [destination];
  const edges: typeof building.edges = [];
  let cursor = destination;
  while (cursor !== start) {
    const p = previous.get(cursor);
    if (!p) return null;
    edges.unshift(p.edge);
    ids.unshift(p.node);
    cursor = p.node;
  }
  return {
    nodes: ids.map((id) => building.nodes.find((n) => n.id === id)!),
    edges,
    distance: distances.get(destination)!,
  };
}

export function evacuationRoute(
  building: Building,
  start: string,
  accessible: boolean,
  blocked: Set<string>,
): Route | null {
  const candidates = building.nodes
    .filter((n) => n.assembly)
    .map((n) => route(building, start, n.id, { accessible, evacuation: true, blocked }))
    .filter((r): r is Route => r !== null);
  return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
}

export interface RouteStep {
  text: string;
  /** Edges covered by this step; blocking the step blocks all of them. */
  edges: string[];
}

// Waypoints that are not worth a line of their own: dense survey graphs chain many of these.
const genericWaypoint =
  /^(?:public |main |side )?(?:gallery|corridor|walkway|hall|hallway|aisle|passage|concourse)$/i;

/**
 * Turn-by-turn steps. Consecutive walking segments through generic waypoints are merged into one
 * step toward the next meaningful place, so a dense graph does not narrate every few metres.
 */
export function routeSteps(path: Route): RouteStep[] {
  if (!path.edges.length) return [{ text: 'You are at the destination.', edges: [] }];
  const steps: RouteStep[] = [];
  let run: { distance: number; edges: string[] } | undefined;
  path.edges.forEach((edge, i) => {
    const next = path.nodes[i + 1];
    if (edge.kind === 'stairs' || edge.kind === 'elevator' || edge.kind === 'outside') {
      if (run) {
        steps.push({
          text: `Continue ${Math.round(run.distance)} m toward ${path.nodes[i].label}.`,
          edges: run.edges,
        });
        run = undefined;
      }
      steps.push({
        text:
          edge.kind === 'stairs'
            ? `Use the stairs to ${next.label}.`
            : edge.kind === 'elevator'
              ? `Take the elevator to ${next.label}.`
              : `Continue outside toward ${next.label}.`,
        edges: [edge.id],
      });
      return;
    }
    run = run
      ? { distance: run.distance + edge.distance, edges: [...run.edges, edge.id] }
      : { distance: edge.distance, edges: [edge.id] };
    const following = path.edges[i + 1];
    const keepWalking =
      following &&
      (following.kind === 'corridor' || following.kind === 'door') &&
      genericWaypoint.test(next.label);
    if (!keepWalking) {
      steps.push({
        text: `Continue ${Math.round(run.distance)} m toward ${next.label}.`,
        edges: run.edges,
      });
      run = undefined;
    }
  });
  return steps;
}

export function directions(path: Route): string[] {
  return routeSteps(path).map((step) => step.text);
}

export function parseCheckpoint(text: string): import('./types').Checkpoint {
  if (text.length > 4096) throw new Error('This QR code is too large.');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Scan a Waypoint checkpoint QR code.');
  }
  if (
    value.v !== 1 ||
    typeof value.building !== 'string' ||
    typeof value.checkpoint !== 'string' ||
    !/^[a-z0-9-]{1,80}$/.test(value.building) ||
    !/^[a-z0-9-]{1,80}$/.test(value.checkpoint)
  )
    throw new Error('Unsupported checkpoint QR code.');
  if (
    value.wifi &&
    (typeof value.wifi.ssid !== 'string' ||
      typeof value.wifi.password !== 'string' ||
      value.wifi.ssid.length > 32 ||
      value.wifi.password.length > 63)
  )
    throw new Error('Invalid building Wi-Fi details.');
  return value;
}

/**
 * Shortest permitted route from `start` to any stairs or elevator landing on `floor`, for
 * requests such as "take me to the 2nd floor". With `accessible`, only elevator landings count.
 */
export function routeToFloor(
  building: Building,
  start: string,
  floor: number,
  options: { accessible?: boolean; blocked?: Set<string> } = {},
): Route | null {
  const landings = new Set<string>();
  for (const edge of building.edges) {
    if (edge.kind !== 'stairs' && edge.kind !== 'elevator') continue;
    if (options.accessible && !edge.accessible) continue;
    for (const id of [edge.from, edge.to])
      if (building.nodes.find((node) => node.id === id)?.floor === floor) landings.add(id);
  }
  let best: Route | null = null;
  for (const id of landings) {
    const candidate = route(building, start, id, options);
    if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
  }
  return best;
}

/**
 * Shortest permitted route to the nearest elevator or stairs landing, preferring the visitor's
 * own floor, for "where is the elevator". The landing itself is reached over corridors, so a
 * step-free route to the stairs is still possible.
 */
export function routeToConnection(
  building: Building,
  start: string,
  kind: 'elevator' | 'stairs',
  options: { accessible?: boolean; blocked?: Set<string> } = {},
): Route | null {
  const landings = new Set<string>();
  for (const edge of building.edges)
    if (edge.kind === kind) {
      landings.add(edge.from);
      landings.add(edge.to);
    }
  const startFloor = building.nodes.find((node) => node.id === start)?.floor;
  const sameFloor = [...landings].filter(
    (id) => building.nodes.find((node) => node.id === id)?.floor === startFloor,
  );
  for (const candidates of [sameFloor, [...landings]]) {
    let best: Route | null = null;
    for (const id of candidates) {
      const candidate = route(building, start, id, options);
      if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
    }
    if (best) return best;
  }
  return null;
}

/** Nodes that are the endpoint of a stairs or elevator connection, optionally on one floor. */
export function connectionLandings(building: Building, floor?: number) {
  const ids = new Set<string>();
  for (const edge of building.edges)
    if (edge.kind === 'stairs' || edge.kind === 'elevator') {
      ids.add(edge.from);
      ids.add(edge.to);
    }
  return building.nodes.filter(
    (node) => ids.has(node.id) && (floor === undefined || node.floor === floor),
  );
}

export interface RouteEndpoint {
  node?: string;
  floor?: number;
  /** Any landing of this kind; the nearest permitted one is used. */
  connection?: 'elevator' | 'stairs';
}
const landingsOfKind = (building: Building, kind: 'elevator' | 'stairs') => {
  const ids = new Set<string>();
  for (const edge of building.edges)
    if (edge.kind === kind) {
      ids.add(edge.from);
      ids.add(edge.to);
    }
  return [...ids];
};

/**
 * Route between two endpoints that may be a node or a whole floor ("from the first floor to
 * the second floor"). A floor endpoint uses whichever of its stairs or elevator landings gives
 * the shortest permitted route. The returned route starts at the chosen start node.
 */
export function routeBetween(
  building: Building,
  from: RouteEndpoint,
  to: RouteEndpoint,
  options: { accessible?: boolean; blocked?: Set<string> } = {},
): Route | null {
  const starts = from.node
    ? [from.node]
    : from.floor !== undefined
      ? connectionLandings(building, from.floor).map((node) => node.id)
      : from.connection
        ? landingsOfKind(building, from.connection)
        : [];
  let best: Route | null = null;
  for (const start of starts) {
    const candidate = to.node
      ? route(building, start, to.node, options)
      : to.floor !== undefined
        ? routeToFloor(building, start, to.floor, options)
        : to.connection
          ? routeToConnection(building, start, to.connection, options)
          : null;
    if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
  }
  return best;
}
