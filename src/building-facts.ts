/**
 * Factual questions about the current building, answered from the signed package rather than
 * by a model: floor count, what is on a floor, which floor a place is on, whether a place exists,
 * how many places of a kind there are, and how far a place is from the visitor's checkpoint.
 */
import type { Building, Room } from './types';
import type { BuildingQuestion } from './chat-intent';
import { matchConnection, matchFloor } from './query-guard';
import { route } from './routing';

export interface FactAnswer {
  text: string;
  /** Places mentioned in the answer, offered as tappable destinations. */
  rooms: Room[];
  /** The visitor needs a confirmed position for this answer. */
  scan?: boolean;
  /** Not answerable from names alone; run a normal destination search for this instead. */
  fallbackQuery?: string;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tail =
  '(?:\\s+(?:please|here|now|right now|today|in (?:this|the) (?:mall|building|tower|place)|of (?:this|the) (?:mall|building|tower|place)|does (?:this|the) (?:mall|building|tower|place) have|are there|is there))*';
const floorsQuestion = new RegExp(
  '^(?:(?:what|whats|what s|which|tell me)(?: is| s)? (?:the )?(?:highest|top|last|uppermost|lowest|bottom|first) (?:floor|level)|how many (?:floors|levels|storeys|stories)|how tall is (?:this|the) (?:building|mall|tower))' +
    tail +
    '$',
);
const myFloorQuestion =
  /^(?:(?:what|which) (?:floor|level) am i (?:on|at)(?: now| right now)?|(?:what|which) (?:floor|level) is this)$/;
const buildingQuestion =
  /^(?:(?:what|which) (?:building|mall|place|tower) (?:is this|am i in|am i at)|tell me about this (?:building|mall|place|tower)|where am i (?:right )?now)$/;
const floorContentsQuestion = new RegExp(
  '^(?:what|whats|what s|which|list|show me|tell me)(?:\\s+(?:stores|shops|places|restaurants|is|are|s|can|i|find|do|you|have|there|all|the|everything|anything))*\\s+(?:on|in|at)\\s+(?:the\\s+)?(.+?)' +
    tail +
    '$',
);
const upDownQuestion =
  /^(?:what|whats|what s|show me|list)(?: is| s| everything| all| the places| the stores| the shops)?(?: on| in| at)? (upstairs|downstairs|this floor|the current floor|my floor|here)$/;
const compareQuestion = new RegExp(
  '^(?:which|what)(?: one| place)? is (?:closer|nearer|closest|nearest|faster to reach|quicker to reach|closer to me)(?: to me| from here)?[,:]?\\s+(?:the\\s+)?(.+?)\\s+or\\s+(?:the\\s+)?(.+?)' +
    tail +
    '$|^(?:the\\s+)?(.+?)\\s+or\\s+(?:the\\s+)?(.+?)[,:]?\\s+(?:which|what)(?: one)? is (?:closer|nearer|closest|nearest)' +
    tail +
    '$',
);
const nearQuestion = new RegExp(
  '^(?:what|which|any|are there any|is there any|is there anything|what s|whats)(?:\\s+(?:is|are|s))?(?:\\s+(shops?|stores?|places?|restaurants?|food|cafes?|coffee|restrooms?|toilets?))?(?:\\s+(?:is|are|there|available|located))*\\s+(?:near|around|close to|next to|beside|nearby|near to)\\s+(?:the\\s+)?(.+?)' +
    tail +
    '$',
);
const placeFloorQuestion = new RegExp(
  '^(?:on )?(?:what|which) (?:floor|level) (?:is|are|can i find|do i find|has|have|do you have) (?:the |an? )?(.+?)(?:\\s+(?:on|at|located|located on|located at|in))?' +
    tail +
    '$',
);
const existsQuestion = new RegExp(
  '^(?:is there|are there|do you have|does (?:this|the) (?:mall|building|tower|place) have|do they have|have you got|got)(?:\\s+(?:an?|any|some))?\\s+(.+?)' +
    tail +
    '$',
);
const countQuestion = new RegExp('^how many (.+?)' + tail + '$');
const distanceQuestion = new RegExp(
  '^(?:how far (?:is|to|away is|is it to|is the walk to) (?:the )?(.+?)(?: from here)?|how long (?:does it take|will it take|is it|is the walk)?\\s*(?:to )?(?:get to |walk to |go to |reach )?(?:the )?(.+?)(?: from here)?)' +
    tail +
    '$',
);

export function matchBuildingQuestion(text: string): BuildingQuestion | undefined {
  const q = normalize(text);
  if (!q) return undefined;
  if (floorsQuestion.test(q)) return { kind: 'floors' };
  if (myFloorQuestion.test(q)) return { kind: 'myFloor' };
  if (buildingQuestion.test(q)) return { kind: 'building' };
  const compare = compareQuestion.exec(q);
  if (compare) return { kind: 'compare', a: compare[1] ?? compare[3], b: compare[2] ?? compare[4] };
  const near = nearQuestion.exec(q);
  if (near) return { kind: 'near', place: near[2], what: near[1] };
  const upDown = upDownQuestion.exec(q);
  if (upDown) return { kind: 'floorContents', floorText: upDown[1] };
  const contents = floorContentsQuestion.exec(q);
  if (contents && /\b(?:floor|level|storey|upstairs|downstairs|here)\b/.test(contents[1]))
    return { kind: 'floorContents', floorText: contents[1] };
  const placeFloor = placeFloorQuestion.exec(q);
  if (placeFloor) return { kind: 'placeFloor', place: placeFloor[1] };
  const exists = existsQuestion.exec(q);
  if (exists) return { kind: 'exists', place: exists[1] };
  const count = countQuestion.exec(q);
  if (count) return { kind: 'count', what: count[1] };
  const distance = distanceQuestion.exec(q);
  if (distance) return { kind: 'distance', place: distance[1] ?? distance[2] };
  return undefined;
}

export type ResolvedEndpoint =
  | { kind: 'floor'; floor: { id: number; name: string } }
  | { kind: 'node'; node: string; label: string; room?: Room }
  /** "the elevator" / "the stairs": the nearest landing of that kind is chosen when routing. */
  | { kind: 'connection'; connection: 'elevator' | 'stairs'; label: string };

/**
 * Turn an endpoint the visitor wrote ("first floor", "food court", "elevator") into a floor or a
 * graph node. Returns undefined when the names do not know it, so callers can fall back to a
 * semantic search for the destination.
 */
export function resolveEndpoint(
  text: string,
  building: Building,
  currentFloor?: number,
): ResolvedEndpoint | undefined {
  const floor = matchFloor(text, building.floors, currentFloor);
  if (floor?.floor) return { kind: 'floor', floor: floor.floor };
  const connection = matchConnection(text);
  if (connection)
    return { kind: 'connection', connection: connection.kind, label: connection.requested };
  if (
    /^(?:the )?(?:main |nearest |building )?(?:entrance|exit|way out|front door|main door|outside|lobby)$/.test(
      normalize(text),
    )
  ) {
    const door = entranceNode(building);
    if (door) return { kind: 'node', node: door.id, label: door.label };
  }
  const rooms = findPlaces(building, text);
  if (rooms.length) {
    const room = rooms[0];
    return { kind: 'node', node: room.node, label: room.name, room };
  }
  const wanted = normalize(text);
  const node = building.nodes.find((candidate) => normalize(candidate.label) === wanted);
  return node ? { kind: 'node', node: node.id, label: node.label } : undefined;
}

/** The building's entrance node: a checkpoint labelled as an entrance, or an outside connection. */
export function entranceNode(building: Building) {
  const labelled = building.nodes.filter((node) => /entrance|exit|lobby/i.test(node.label));
  const checkpoint = labelled.find((node) => node.checkpoint);
  if (checkpoint ?? labelled[0]) return checkpoint ?? labelled[0];
  const outside = building.edges.find((edge) => edge.kind === 'outside');
  return outside ? building.nodes.find((node) => node.id === outside.from) : undefined;
}

/** Rooms whose name or aliases match the place the visitor named, allowing plurals. */
export function findPlaces(building: Building, place: string) {
  const wanted = normalize(place).replace(/^(?:the|an?|any|some) /, '');
  if (!wanted) return [];
  const forms = new Set([
    wanted,
    wanted.replace(/ies$/, 'y'),
    wanted.replace(/(?:sh|ch|x|s)es$/, (end) => end.slice(0, -2)),
    wanted.replace(/s$/, ''),
    `${wanted}s`,
    `${wanted}es`,
  ]);
  // A room name inside the request ("samsung store") counts; an alias inside it does not, or
  // "coffee bean" would match every place aliased "coffee".
  const matches = (candidate: string, allowInsideRequest: boolean) => {
    const name = normalize(candidate);
    return [...forms].some(
      (form) =>
        form === name ||
        name.includes(form) ||
        (allowInsideRequest &&
          name.length > 3 &&
          new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(form)),
    );
  };
  return building.rooms.filter(
    (room) => matches(room.name, true) || room.aliases.some((alias) => matches(alias, false)),
  );
}

const floorName = (building: Building, id: number) =>
  building.floors.find((floor) => floor.id === id)?.name ?? `floor ${id + 1}`;
const list = (names: string[], limit = 6) =>
  names.length <= limit
    ? names.join(', ')
    : `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`;
const byName = (rooms: Room[]) => {
  const groups = new Map<string, Room[]>();
  for (const room of rooms) groups.set(room.name, [...(groups.get(room.name) ?? []), room]);
  return groups;
};
const categories: [RegExp, string, string][] = [
  [/restaurant|food|eat|dining|cafe|coffee|snack/, 'food', 'places to eat or drink'],
  [/restroom|toilet|bathroom|washroom|comfort room/, 'facilities', 'restrooms'],
  [/store|shop|retail|boutique/, 'shopping', 'stores'],
  [/clinic|pharmac|drugstore|health|medical/, 'health', 'health places'],
];

export function answerBuildingQuestion(
  question: BuildingQuestion,
  building: Building,
  context: { origin?: string; currentFloor?: number; accessible: boolean; blocked: Set<string> },
): FactAnswer | undefined {
  const floors = building.floors;
  switch (question.kind) {
    case 'floors': {
      const first = floors[0];
      const last = floors[floors.length - 1];
      return {
        text:
          floors.length === 1
            ? `${building.name} has a single mapped floor: ${first.name}.`
            : `${building.name} has ${floors.length} floors, from ${first.name} to ${last.name}. The highest is ${last.name}.`,
        rooms: [],
      };
    }
    case 'myFloor': {
      const node = building.nodes.find((candidate) => candidate.id === context.origin);
      if (!node)
        return {
          text: 'Scan a checkpoint so I can confirm which floor you are on.',
          rooms: [],
          scan: true,
        };
      return {
        text: `Your last confirmed position, ${node.label}, is on ${floorName(building, node.floor)}.`,
        rooms: [],
      };
    }
    case 'building':
      return {
        text: `You are viewing ${building.name}: ${floors.length} ${floors.length === 1 ? 'floor' : 'floors'} and ${building.rooms.length} mapped places. ${building.provenance?.layoutStatus ?? 'Fictional building'} · demo only.`,
        rooms: [],
      };
    case 'floorContents': {
      const request = /^(?:this floor|the current floor|my floor|here)$/.test(question.floorText)
        ? {
            floor: floors.find((floor) => floor.id === (context.currentFloor ?? 0)),
            requested: 'this floor',
          }
        : matchFloor(question.floorText, floors, context.currentFloor);
      if (!request) return undefined;
      if (!request.floor)
        return {
          text: `${building.name} has no ${request.requested}. Its floors are ${floors.map((floor) => floor.name).join(', ')}.`,
          rooms: [],
        };
      const rooms = building.rooms.filter((room) => room.floor === request.floor!.id);
      return {
        text: rooms.length
          ? `${request.floor.name} has ${rooms.length} mapped ${rooms.length === 1 ? 'place' : 'places'}: ${list([...new Set(rooms.map((room) => room.name))])}.`
          : `${request.floor.name} has no mapped places in this demo.`,
        rooms: rooms.slice(0, 6),
      };
    }
    case 'placeFloor':
    case 'exists': {
      const rooms = findPlaces(building, question.place);
      if (!rooms.length) return { text: '', rooms: [], fallbackQuery: question.place };
      const sentences = [...byName(rooms)].map(([name, group]) => {
        const names = [...new Set(group.map((room) => floorName(building, room.floor)))];
        return `${name} is on ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`;
      });
      return {
        text: `${question.kind === 'exists' ? 'Yes. ' : ''}${sentences.join('. ')}.`,
        rooms: rooms.slice(0, 3),
      };
    }
    case 'count': {
      const what = normalize(question.what);
      if (/elevator|lift/.test(what) || /stairs|staircase|stairway/.test(what)) {
        const kind = /elevator|lift/.test(what) ? 'elevator' : 'stairs';
        const landings = new Set<string>();
        for (const edge of building.edges)
          if (edge.kind === kind) for (const id of [edge.from, edge.to]) landings.add(id);
        const perFloor = new Map<number, number>();
        for (const id of landings) {
          const floor = building.nodes.find((node) => node.id === id)?.floor ?? 0;
          perFloor.set(floor, (perFloor.get(floor) ?? 0) + 1);
        }
        const count = Math.max(0, ...perFloor.values());
        return {
          text: count
            ? `${building.name} has ${count} mapped ${kind === 'elevator' ? (count === 1 ? 'elevator' : 'elevators') : 'stairways'} serving ${perFloor.size} ${perFloor.size === 1 ? 'floor' : 'floors'}.`
            : `${building.name} has no mapped ${kind === 'elevator' ? 'elevators' : 'stairs'} in this demo.`,
          rooms: [],
        };
      }
      const category = categories.find(([pattern]) => pattern.test(what));
      const rooms = category
        ? building.rooms.filter((room) => room.category === category[1])
        : /place|destination|room|thing|location/.test(what)
          ? building.rooms
          : findPlaces(building, what);
      const label = category
        ? category[2]
        : /place|destination|room|thing|location/.test(what)
          ? 'places'
          : question.what;
      if (!rooms.length) return { text: '', rooms: [], fallbackQuery: question.what };
      return {
        text: `${building.name} has ${rooms.length} mapped ${label}: ${list([...new Set(rooms.map((room) => room.name))])}.`,
        rooms: rooms.slice(0, 6),
      };
    }
    case 'compare': {
      const sides = [question.a, question.b].map((name) => ({
        name,
        rooms: findPlaces(building, name),
      }));
      const unknown = sides.find((side) => !side.rooms.length);
      if (unknown)
        return {
          text: `I do not know a place called “${unknown.name}” in ${building.name}. Try a name from the directory.`,
          rooms: [],
        };
      const start = building.nodes.find((node) => node.id === context.origin);
      if (!start)
        return {
          text: 'Scan a checkpoint so I can compare the walking distances from where you are.',
          rooms: sides.map((side) => side.rooms[0]),
          scan: true,
        };
      const measured = sides.map((side) => {
        const routed = side.rooms
          .map((room) => ({
            room,
            path: route(building, start.id, room.node, {
              accessible: context.accessible,
              blocked: context.blocked,
            }),
          }))
          .filter((entry) => entry.path)
          .sort((a, b) => a.path!.distance - b.path!.distance)[0];
        return {
          name: routed?.room.name ?? side.rooms[0].name,
          room: routed?.room ?? side.rooms[0],
          metres: routed ? Math.round(routed.path!.distance) : undefined,
        };
      });
      const [first, second] = [...measured].sort(
        (a, b) => (a.metres ?? Infinity) - (b.metres ?? Infinity),
      );
      if (first.metres === undefined)
        return {
          text: `There is no permitted${context.accessible ? ' step-free' : ''} route to either place from ${start.label}.`,
          rooms: [],
        };
      return {
        text:
          second.metres === undefined
            ? `${first.name} is reachable, about ${first.metres} m from ${start.label}; there is no permitted route to ${second.name}.`
            : first.metres === second.metres
              ? `They are about the same: ${first.name} and ${second.name} are both about ${first.metres} m from ${start.label}.`
              : `${first.name} is closer: about ${first.metres} m from ${start.label}, versus ${second.name} at about ${second.metres} m.`,
        rooms: [first.room, second.room],
      };
    }
    case 'near': {
      const place = normalize(question.place);
      const anchor = /^(?:me|here|my (?:location|position)|where i am)$/.test(place)
        ? building.nodes.find((node) => node.id === context.origin)
        : /^(?:the )?(?:main |nearest )?(?:entrance|exit|way out|front door|lobby)$/.test(place)
          ? entranceNode(building)
          : (() => {
              const room = findPlaces(building, question.place)[0];
              return room ? building.nodes.find((node) => node.id === room.node) : undefined;
            })();
      if (!anchor) {
        if (/^(?:me|here|my (?:location|position)|where i am)$/.test(place))
          return {
            text: 'Scan a checkpoint so I can list what is near you.',
            rooms: [],
            scan: true,
          };
        return { text: '', rooms: [], fallbackQuery: question.place };
      }
      const category = question.what
        ? categories.find(([pattern]) => pattern.test(normalize(question.what!)))
        : undefined;
      const anchorRoom = findPlaces(building, question.place)[0];
      const nearby = building.rooms
        .filter((room) => room !== anchorRoom && (!category || room.category === category[1]))
        .map((room) => ({
          room,
          path: route(building, anchor.id, room.node, {
            accessible: context.accessible,
            blocked: context.blocked,
          }),
        }))
        .filter((entry) => entry.path)
        .sort((a, b) => a.path!.distance - b.path!.distance);
      const unique: typeof nearby = [];
      for (const entry of nearby)
        if (!unique.some((seen) => seen.room.name === entry.room.name)) unique.push(entry);
      const top = unique.slice(0, 4);
      if (!top.length)
        return {
          text: `Nothing ${category ? category[2] : 'mapped'} is reachable near ${anchor.label} in this demo.`,
          rooms: [],
        };
      return {
        text: `Closest ${category ? category[2] : 'places'} to ${anchor.label}: ${top.map((entry) => `${entry.room.name} (${Math.round(entry.path!.distance)} m)`).join(', ')}.`,
        rooms: top.map((entry) => entry.room),
      };
    }
    case 'distance': {
      const rooms = findPlaces(building, question.place);
      if (!rooms.length) return { text: '', rooms: [], fallbackQuery: question.place };
      const start = building.nodes.find((node) => node.id === context.origin);
      if (!start)
        return {
          text: `Scan a checkpoint so I can measure the walk to ${rooms[0].name}.`,
          rooms: rooms.slice(0, 3),
          scan: true,
        };
      const routed = rooms
        .map((room) => ({
          room,
          path: route(building, start.id, room.node, {
            accessible: context.accessible,
            blocked: context.blocked,
          }),
        }))
        .filter((entry) => entry.path)
        .sort((a, b) => a.path!.distance - b.path!.distance);
      if (!routed.length)
        return {
          text: `There is no permitted${context.accessible ? ' step-free' : ''} route to ${rooms[0].name} from ${start.label}.`,
          rooms: [],
        };
      const { room, path } = routed[0];
      const metres = Math.round(path!.distance);
      return {
        text: `${room.name} on ${floorName(building, room.floor)} is about ${metres} m from ${start.label}, roughly ${Math.max(1, Math.ceil(metres / 80))} min on foot${context.accessible ? ' using step-free connections' : ''}.`,
        rooms: [room],
      };
    }
  }
}
