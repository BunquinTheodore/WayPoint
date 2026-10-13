/**
 * Deterministic guardrails shared by the destination search box and the chat. They run before
 * any model so that off-topic requests never become a destination search, and so that a request
 * to visit another demo building switches the map instead of returning unrelated rooms.
 */
import { demos } from './demos';
import { stripRoutePreferences, type OffTopicReason } from './chat-intent';

export type QueryGuard =
  | { kind: 'building'; id: string; name: string; current: boolean }
  | { kind: 'floor'; request: FloorRequest }
  | { kind: 'connection'; request: ConnectionRequest }
  | { kind: 'exit' }
  | { kind: 'offtopic'; reason: OffTopicReason }
  | { kind: 'place' };

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "go to", "take me to the", "i want to switch to" ... followed by the whole building name only.
const commandPrefix =
  '(?:(?:i (?:want|would like|need|wanna) to|can (?:you|we)|could you|please|let s|lets|ok|okay|hey)\\s+)*' +
  '(?:(?:go|switch|take me|bring me|get me|move|jump|change|navigate|travel|transfer|open|show|load|view|visit|teleport|head|back)\\s+)?' +
  '(?:(?:to|the|me|over|map|building|demo|into|in|at)\\s+)*';
const commandSuffix = '(?:\\s+(?:building|mall|map|demo|model|please|now|instead))*';
const buildingPatterns = demos.flatMap((demo) =>
  [demo.name, ...(demo.aliases ?? [])].map((alias) => ({
    id: demo.id,
    name: demo.name,
    pattern: new RegExp(`^${commandPrefix}${escapeRegExp(normalize(alias))}${commandSuffix}$`),
  })),
);

/** A whole-message request to open one of the bundled demo buildings. */
export function matchBuilding(text: string, currentBuildingId?: string) {
  const query = normalize(text);
  if (!query) return undefined;
  const match = buildingPatterns.find(({ pattern }) => pattern.test(query));
  return match
    ? { id: match.id, name: match.name, current: match.id === currentBuildingId }
    : undefined;
}

const offTopicRules: [OffTopicReason, RegExp][] = [
  [
    'injection',
    /\b(ignore (?:your|the|all|any|previous|prior|these) (?:rules|instructions|prompt)|system prompt|jailbreak|developer mode|pretend (?:you are|to be|you re)|act as (?:a|an|my|if)|you are now|new instructions)\b/,
  ],
  [
    'info',
    /\b(open(?:ing)? (?:hours?|times?)|closing (?:hours?|times?)|(?:is|are) (?:it|they|this|the \w+) (?:still )?open|what time (?:does|do|will|is) .*(?:open|close)|(?:open|close)s? (?:at|until|till)|prices?|how much|cost|discount|promo|coupon|menu|crowded|how busy|wait(?:ing)? time|queue|parking (?:fee|rate|slot|space)|in stock|(?:can|may) i bring|pets? (?:allowed|policy|friendly)|(?:dogs?|cats?) allowed|bring my (?:dog|cat|pet)|policy|dress code|smoking (?:allowed|area)|allowed (?:inside|in here))\b/,
  ],
  [
    'time',
    /^(?:what|whats|what s|tell me) (?:the )?(?:time|date|day)(?: (?:is it|today|now|is today))?$/,
  ],
  [
    'personal',
    /\b(my (?:dog|cat|pet|name|age|birthday|wife|husband|girlfriend|boyfriend|mom|dad|mother|father|friend|crush)|your name|who (?:are|made|created|built|trained) you|how are you|are you (?:a |an )?(?:human|robot|bot|real|ai|chatgpt|siri|alexa)|i love you|marry me|tell me about yourself|do you (?:like|love|know|remember) me)\b/,
  ],
  [
    'general',
    /\b(weather|forecast|raining|temperature|news|stock market|bitcoin|crypto|lottery|horoscope|joke|riddle|poem|tell me a story|sing|lyrics|recipe|essay|homework|translate|translation|define|definition|meaning of|capital of|president|prime minister|election|politic\w*|religion|math|calculate|solve|equation|\d+ ?[-+*/x×] ?\d+|write (?:me )?(?:a |an |some |my )|code|coding|program|python|javascript|sql|email|resume|who (?:is|was|are) [a-z]+ [a-z]+)\b/,
  ],
];

/** Why a message is outside the navigation purpose, or undefined when it may be a place request. */
export function offTopic(text: string): OffTopicReason | undefined {
  // Normalized text catches punctuation variants; the raw text keeps arithmetic operators.
  const query = normalize(text);
  const raw = text.toLowerCase().trim();
  return offTopicRules.find(([, pattern]) => pattern.test(query) || pattern.test(raw))?.[0];
}

export function offTopicReply(reason: OffTopicReason, buildingName: string) {
  switch (reason) {
    case 'info':
      return `I only have the saved map of ${buildingName}, not opening hours, prices, menus, or how busy places are. Tell me a place and I will find the route.`;
    case 'time':
      return 'I cannot tell the time or date, but I can find a place in this building. Where would you like to go?';
    case 'injection':
      return 'I only follow Waypoint’s navigation rules. Tell me a place in this building and I will find the route.';
    case 'personal':
      return `I am Waypoint, the offline guide for ${buildingName}, so I do not know personal details and cannot chat about them. I can find stores, restrooms, services, and routes here.`;
    default:
      return `That is outside what I can help with. I am the offline guide for ${buildingName}: I can find stores, restrooms, services, and routes. Where would you like to go?`;
  }
}

export function classifyQuery(
  text: string,
  currentBuildingId?: string,
  floors: { id: number; name: string }[] = [],
  currentFloor?: number,
): QueryGuard {
  const building = matchBuilding(text, currentBuildingId);
  if (building) return { kind: 'building', ...building };
  const request = matchFloor(text, floors, currentFloor);
  if (request) return { kind: 'floor', request };
  const connection = matchConnection(text);
  if (connection) return { kind: 'connection', request: connection };
  if (matchExit(text)) return { kind: 'exit' };
  const reason = offTopic(text);
  if (reason) return { kind: 'offtopic', reason };
  return { kind: 'place' };
}

const exitPattern = new RegExp(
  '^(?:' +
    commandPrefix +
    '(?:(?:where (?:is|s)|find|locate|show me|i need)\\s+)?(?:the\\s+)?(?:(?:main|nearest|closest|building)\\s+)?(?:exit|entrance|way out|front door|main door|doors?)(?:\\s+(?:please|now|here|of (?:the|this) (?:mall|building|tower)))*' +
    '|(?:take me|bring me|get me|go|head|i want to go|i need to go)\\s+(?:back\\s+)?(?:to\\s+)?(?:the\\s+)?(?:(?:main|nearest)\\s+)?(?:exit|entrance|door|way out|outside)(?:\\s+please)?' +
    '|how (?:do|can) i (?:get|go) (?:out|outside|back out|back to the entrance)' +
    ')$',
);
/** "where is the exit", "take me back to the entrance", "how do I get out". */
export function matchExit(text: string) {
  return exitPattern.test(normalize(text));
}

export interface FloorQualifier {
  /** The query with the floor phrase removed. */
  text: string;
  floor?: { id: number; name: string };
}
const floorPhrase =
  '((?:\\d+(?:st|nd|rd|th)?|ground|top|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\s+(?:floor|level)|(?:floor|level)\\s+\\d+|\\d+f)';
const trailingQualifier = new RegExp(`\\s+(?:on|at|in|of|to)\\s+(?:the\\s+)?${floorPhrase}$`);
const leadingQualifier = new RegExp(`^${floorPhrase}\\s+(?:restrooms?|.+)$`);

/** "nearest restroom on floor 7" → query "nearest restroom" limited to floor 7. */
export function splitFloorQualifier(
  text: string,
  floors: { id: number; name: string }[],
  currentFloor?: number,
): FloorQualifier {
  const query = normalize(text);
  const trailing = trailingQualifier.exec(query);
  const leading = trailing ? undefined : leadingQualifier.exec(query);
  const phrase = trailing?.[1] ?? leading?.[1];
  if (!phrase) return { text };
  const floor = matchFloor(phrase, floors, currentFloor)?.floor;
  if (!floor) return { text };
  const rest = trailing ? query.slice(0, trailing.index) : query.slice(phrase.length);
  return { text: rest.trim() || text, floor };
}

export interface ConnectionRequest {
  /** Routing graph kind. The demo graphs model escalators as stairs connections. */
  kind: 'elevator' | 'stairs';
  /** What the visitor called it: elevator, escalator, or stairs. */
  requested: 'elevator' | 'escalator' | 'stairs';
}
const connectionPattern = new RegExp(
  '^' +
    commandPrefix +
    '(?:(?:where (?:is|are|s)|find|locate|show me|i need|i am looking for|looking for)\\s+)?' +
    '(?:(?:the|an?|nearest|closest|a nearby|some)\\s+)*' +
    '(elevators?|lifts?|escalators?|stairs|staircases?|stairways?|steps)' +
    '(?:\\s+(?:near me|nearby|here|around here|on this floor|please|now))*$',
);

/** A whole-message request for the nearest elevator, escalator, or stairs. */
export function matchConnection(text: string): ConnectionRequest | undefined {
  const match = connectionPattern.exec(normalize(text));
  if (!match) return undefined;
  const word = match[1];
  if (/^(?:elevator|lift)/.test(word)) return { kind: 'elevator', requested: 'elevator' };
  if (/^escalator/.test(word)) return { kind: 'stairs', requested: 'escalator' };
  return { kind: 'stairs', requested: 'stairs' };
}

export interface RouteRequest {
  /** Starting point as the visitor wrote it; undefined means their current position. */
  from?: string;
  /** Destination as the visitor wrote it. */
  to: string;
}
const routeKeyword =
  '(?:(?:create|make|plan|show|give|give me|find|get|build|draw|generate|i need|i want|i would like|can you|could you|please|pls)\\s+)*' +
  '(?:(?:a|an|the|me|me a|me the|us|us a)\\s+)*' +
  '(?:(?:step free|accessible|wheelchair|elevator|fastest|shortest|quickest|quick|best|easiest|safest|safe|new|another)\\s+)*' +
  '(?:route|routes|path|directions?|way|navigation|navigate|how (?:do|can|would|should|to) i? ?(?:get|go|walk|reach|travel))';
// Words visitors put between the keyword and the endpoints: "route going to", "path that leads to".
const routeFiller =
  '(?:\\s+(?:going|heading|leading|that goes|that leads|which goes|starting|starts|for me|for|me|please|pls))*';
const pairVerb = '(?:(?:go|walk|travel|get|move|head|take me|bring me)\\s+)';
const routeRequest = new RegExp(
  `^(?:${routeKeyword}\\b${routeFiller}\\s*(?:from\\s+|to\\s+)?|${pairVerb}?from\\s+)(.+?)\\s+to\\s+(.+?)(?:\\s+please)?$`,
);
const destinationOnly = new RegExp(
  `^${routeKeyword}\\b${routeFiller}\\s*(?:to|towards|for|until)\\s+(.+?)(?:\\s+please)?$`,
);
const herePattern =
  /^(?:here|my (?:location|position|spot|current (?:location|position))|where i am|my checkpoint|current (?:location|position))$/;

/** "route from A to B", "how do I get from A to B", "route A to B", or "route to B". */
// "floor 1 - floor 7", "A -> B", "A → B": separators visitors use instead of "to".
const separators = /\s*(?:->|→|=>|⇒|›)\s*|\s+[-–—>]+\s+/g;
// A bare "floor 1 to floor 7" needs no keyword when the start is clearly a floor.
const bareFloorPair = new RegExp(
  '^((?:floor|level|lvl|storey) \\d+|\\d+(?:st|nd|rd|th)? (?:floor|level)|(?:ground|top|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) (?:floor|level))\\s+to\\s+(.+?)(?:\\s+please)?$',
);

export function matchRouteRequest(text: string): RouteRequest | undefined {
  // "to the fourth floor without stairs": the preference is handled separately, not as a place.
  const query = normalize(stripRoutePreferences(text.replace(separators, ' to ')));
  if (!query) return undefined;
  const clean = (endpoint: string) => endpoint.replace(/^(?:the|a|an)\s+/, '').trim();
  const pair = routeRequest.exec(query);
  if (pair) {
    const from = clean(pair[1]);
    // "route going to the elevator": the regex can read the filler as a start; it is not one.
    if (
      /^(?:going|heading|leading|that goes|that leads|which goes|starting|starts|for me|for|me|please|pls)$/.test(
        from,
      )
    )
      return { to: clean(pair[2]) };
    return { from: herePattern.test(from) ? undefined : from, to: clean(pair[2]) };
  }
  const single = destinationOnly.exec(query);
  if (single) return { to: clean(single[1]) };
  const bare = bareFloorPair.exec(query);
  if (bare) return { from: bare[1], to: clean(bare[2]) };
  return undefined;
}

/**
 * Cosine similarity is not confidence, and absolute scores vary by building: the right answer
 * for "watch a movie" scores 0.31 in one mall and 0.21 in another, while nonsense can reach
 * 0.26 against a cluster of identical restrooms. A candidate therefore counts when it is either
 * strong on its own or clearly stands out from the rest of the building (z-score over all
 * rooms), and runners-up must stay close to the best. Pass the full ranking, not a top slice.
 */
export function relevantMatches<T extends { score: number }>(
  ranked: T[],
  { strong = 0.35, floor = 0.18, standout = 2.6, band = 0.12 } = {},
) {
  const scores = ranked.map(({ score }) => score).filter(Number.isFinite);
  if (!scores.length) return [];
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const deviation =
    Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length) ||
    Number.EPSILON;
  const qualifies = ({ score }: T) =>
    Number.isFinite(score) &&
    (score >= strong || (score >= floor && (score - mean) / deviation >= standout));
  const best = ranked.find(qualifies)?.score;
  if (best === undefined) return [];
  return ranked.filter((entry) => qualifies(entry) && entry.score >= best - band);
}

export interface FloorRequest {
  /** The matched floor, or undefined when the building has no such floor. */
  floor?: { id: number; name: string };
  /** What the visitor asked for, for the "no such floor" reply. */
  requested: string;
}
const floorWords: Record<string, number> = {
  ground: 0,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const floorPrefix =
  '(?:(?:i (?:want|would like|need|wanna) to|can (?:you|we)|could you|please|let s|lets|ok|okay|hey)\\s+)*' +
  '(?:(?:go|take me|bring me|get me|move|head|navigate|travel|show|view|switch)\\s+(?:up |down )?)?' +
  '(?:(?:to|the|me|up|down|on|at|onto)\\s+)*';
const floorSuffix = '(?:\\s+(?:please|now|instead|of (?:the |this )?(?:mall|building|tower)))*';
const absoluteFloor = new RegExp(
  '^' +
    floorPrefix +
    '(?:(?:(ground|top|[a-z]+|\\d+)(?:st|nd|rd|th)?\\s+(?:floor|level|storey|story))|(?:(?:floor|level|lvl|storey)\\s*(\\d+))|(\\d+)\\s*f)' +
    floorSuffix +
    '$',
);
const relativeFloor = new RegExp(
  '^' +
    floorPrefix +
    '(upstairs|downstairs|(?:one|a|next) floor (up|down)|(?:up|down) (?:one|a) floor|the (next|previous) floor)' +
    floorSuffix +
    '$',
);

/** A whole-message request to go to a floor, resolved against the building's floor list. */
export function matchFloor(
  text: string,
  floors: { id: number; name: string }[],
  currentFloor?: number,
): FloorRequest | undefined {
  const query = normalize(text);
  if (!query || !floors.length) return undefined;
  const relative = relativeFloor.exec(query);
  if (relative) {
    const up = /up|next/.test(relative[0]) && !/downstairs|down/.test(relative[0]);
    const current = currentFloor ?? 0;
    const target = floors.find((floor) => floor.id === (up ? current + 1 : current - 1));
    return { floor: target, requested: up ? 'a floor above this one' : 'a floor below this one' };
  }
  const absolute = absoluteFloor.exec(query);
  if (!absolute) return undefined;
  const word = absolute[1] ?? absolute[2] ?? absolute[3];
  if (word === 'top') return { floor: floors[floors.length - 1], requested: 'the top floor' };
  if (word === 'ground') {
    const ground = floors.find((floor) => /ground/i.test(floor.name)) ?? floors[0];
    return { floor: ground, requested: 'the ground floor' };
  }
  const number = /^\d+$/.test(word) ? Number(word) : floorWords[word];
  if (number === undefined) return undefined;
  const named = floors.find((floor) => new RegExp('\\b' + number + '\\b').test(floor.name));
  const floor = named ?? floors.find((floor) => floor.id === number - 1);
  return { floor, requested: `floor ${number}` };
}
