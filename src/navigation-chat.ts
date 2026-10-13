import type { Building, Room } from './types';
import { explicitRoutePreferences, isPureRoutePreference, type ChatIntent } from './chat-intent';
import { route, routeToConnection, routeToFloor } from './routing';
import {
  answerBuildingQuestion,
  matchBuildingQuestion,
  resolveEndpoint,
  type ResolvedEndpoint,
} from './building-facts';
import { routeBetween } from './routing';
import { matchExit, matchRouteRequest, splitFloorQualifier } from './query-guard';
import { expandNeed } from './needs';
import { demos } from './demos';
import {
  matchBuilding,
  matchConnection,
  matchFloor,
  offTopic,
  offTopicReply,
  relevantMatches,
} from './query-guard';

export interface ChatState {
  buildingId: string;
  query: string;
  stepFree: boolean;
  nearest: boolean;
  choices: string[];
  excluded: string[];
}
export interface ChatContext {
  building: Building;
  origin?: string;
  sample: boolean;
  accessible: boolean;
  blocked: Set<string>;
  /** Destination of the route currently shown on the map, if any. */
  routeTo?: Room;
  /** Floor currently shown in the viewer. */
  floor?: number;
}
export interface ChatChoice {
  room: Room;
  distance?: number;
  reachable: boolean;
}
export interface ChatReply {
  text: string;
  choices: ChatChoice[];
  state: ChatState;
  action?: 'scan' | 'evacuation' | 'building' | 'floor' | 'connection' | 'route';
  buildingId?: string;
  floorId?: number;
  nodeId?: string;
  nodeLabel?: string;
  routeStartId?: string;
  routeTargetId?: string;
  routeLabel?: string;
}
export type SearchDestinations = (query: string) => Promise<{ room: Room; score: number }[]>;
export const emptyChat = (buildingId = ''): ChatState => ({
  buildingId,
  query: '',
  stepFree: false,
  nearest: false,
  choices: [],
  excluded: [],
});

export function simpleIntent(
  message: string,
  previousQuery = '',
  currentBuildingId?: string,
  floors: Building['floors'] = [],
  currentFloor?: number,
): ChatIntent | undefined {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '');
  const base: ChatIntent = {
    action: 'search',
    query: text,
    stepFree: 'keep',
    nearest: false,
    choice: 0,
  };
  if (/^(hi|hello|hey|help|what can you do)$/.test(text))
    return { ...base, action: 'help', query: '' };
  // Short closers need no search and no model.
  if (
    /^(?:thanks|thank you|thank u|thx|ty|great|cool|nice|got it|perfect|awesome|bye|goodbye)$/.test(
      text,
    )
  )
    return { ...base, action: 'ack', query: '', ackKind: 'thanks' };
  if (/^(?:cancel|never ?mind|stop|forget it|no thanks|no|nope|nah)$/.test(text))
    return { ...base, action: 'ack', query: '', ackKind: 'cancel' };
  if (/^(?:ok|okay|k|sure|yes|yeah|yep|alright|fine)$/.test(text))
    return { ...base, action: 'ack', query: '', ackKind: 'ok' };
  if (/^(where am i|what is my location|my location|i am lost|i m lost|im lost|lost)$/.test(text))
    return { ...base, action: 'location', query: '' };
  if (
    /\b(evacuate|evacuation|emergency exit|fire escape|fire|smoke|earthquake|emergency|get out of (?:here|the building)|way out in an emergency)\b/.test(
      text,
    )
  )
    return { ...base, action: 'evacuation', query: '' };
  const choice = /^(?:the |option |number )?(first|second|third|[123])(?: one)?$/.exec(text);
  if (choice)
    return {
      ...base,
      action: 'choose',
      query: '',
      choice: { first: 1, second: 2, third: 3 }[choice[1]] ?? Number(choice[1]),
    };
  if (
    /^(another(?: one)?|something else|closer(?: one)?|nearest(?: one)?|avoid stairs|no stairs|step[- ]free|stairs are (?:ok|okay))$/.test(
      text,
    )
  )
    return {
      ...base,
      action: 'refine',
      query: previousQuery,
      nearest: /closer|nearest/.test(text),
      stepFree: /avoid stairs|no stairs|step[- ]free/.test(text)
        ? 'yes'
        : /stairs are/.test(text)
          ? 'no'
          : 'keep',
    };
  // "I don't want to use stairs" on its own changes the routing preference; no model call needed.
  if (isPureRoutePreference(message)) {
    const preferences = explicitRoutePreferences(message);
    return {
      ...base,
      action: 'refine',
      query: previousQuery,
      nearest: preferences.nearest,
      stepFree: preferences.stepFree,
    };
  }
  // Guardrails run before the model: a building name switches the map, and conversation outside
  // the navigation purpose is declined without a destination search.
  const target = matchBuilding(message, currentBuildingId);
  if (target) return { ...base, action: 'building', query: '', buildingId: target.id };
  const floor = matchFloor(message, floors, currentFloor);
  if (floor)
    return {
      ...base,
      action: 'floor',
      query: '',
      floorId: floor.floor?.id,
      floorLabel: floor.requested,
    };
  const question = matchBuildingQuestion(message);
  if (question) return { ...base, action: 'question', query: '', question };
  if (matchExit(message)) return { ...base, action: 'route', query: '', routeTo: 'entrance' };
  const routeRequest = matchRouteRequest(message);
  if (routeRequest)
    return {
      ...base,
      action: 'route',
      query: '',
      routeFrom: routeRequest.from,
      routeTo: routeRequest.to,
    };
  const connection = matchConnection(message);
  if (connection)
    return {
      ...base,
      action: 'connection',
      query: '',
      connectionKind: connection.kind,
      connectionLabel: connection.requested,
    };
  const reason = offTopic(message);
  if (reason) return { ...base, action: 'unsupported', query: '', reason };
  return undefined;
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export async function answerNavigation(
  message: string,
  intent: ChatIntent,
  previous: ChatState,
  context: ChatContext,
  search: SearchDestinations,
): Promise<ChatReply> {
  const { building, origin, sample, blocked } = context;
  const state = {
    ...(previous.buildingId === building.id ? previous : emptyChat(building.id)),
    stepFree: context.accessible,
  };
  const preferences = explicitRoutePreferences(message);
  if (intent.stepFree === 'yes' || preferences.stepFree === 'yes') state.stepFree = true;
  else if (intent.stepFree === 'no' && preferences.stepFree === 'no') state.stepFree = false;
  const reply = (
    text: string,
    choices: ChatChoice[] = [],
    action?: ChatReply['action'],
  ): ChatReply => ({ text, choices, state, action });
  if (intent.action === 'ack') {
    if (intent.ackKind === 'cancel') state.choices = [];
    return reply(
      intent.ackKind === 'thanks'
        ? 'You are welcome. Tell me another place whenever you need one.'
        : intent.ackKind === 'cancel'
          ? 'Okay, cancelled. Tell me where to go next.'
          : state.choices.length
            ? 'Great. Tap a suggestion to see its route, or tell me another place.'
            : 'Okay. Where would you like to go?',
    );
  }
  if (intent.action === 'help')
    return reply(
      'Tell me where you want to go or what you need. Try “Find coffee,” “Nearest restroom,” or “Avoid stairs.” I use this building’s saved map.',
    );
  if (intent.action === 'unsupported' && !matchBuildingQuestion(message)) {
    const reason = intent.reason ?? offTopic(message);
    return reply(
      reason
        ? offTopicReply(reason, building.name)
        : 'I can help find mapped places and routes in this building. I do not have live opening hours, prices, or crowd information. What place do you need?',
    );
  }
  if (intent.action === 'building') {
    if (intent.buildingId === building.id)
      return reply(
        `You are already viewing ${building.name}. Tell me a place here and I will find the route.`,
      );
    const target = demos.find((demo) => demo.id === intent.buildingId);
    if (!target) return reply('That building is not included in this app. Choose one from Demos.');
    return {
      text: `Switching to ${target.name}. The conversation starts fresh for that map.`,
      choices: [],
      state,
      action: 'building',
      buildingId: target.id,
    };
  }
  if (intent.action === 'location') {
    const node = building.nodes.find((node) => node.id === origin);
    return node
      ? reply(
          `${sample ? 'Your demo starting point is' : 'Your last scanned checkpoint is'} ${node.label}. Scan a checkpoint to update your position; the marker does not track your movement.`,
          [],
          'scan',
        )
      : reply('Scan a checkpoint so I can use your confirmed starting point.', [], 'scan');
  }
  if (intent.action === 'evacuation')
    return reply(
      'Open the evacuation guide to review the demo’s mapped exit options and limitations. These illustrative maps cannot establish which exits are safe in a real emergency.',
      [],
      'evacuation',
    );

  const candidate = (room: Room): ChatChoice => {
    const path = origin
      ? route(building, origin, room.node, { accessible: state.stepFree, blocked })
      : null;
    return { room, distance: path?.distance, reachable: !origin || path !== null };
  };
  // Factual questions ("how many floors", "what's on level 2", "is there a cinema") are answered
  // from the package. A place the names do not know falls through to a normal search.
  const asked =
    intent.action === 'question'
      ? intent.question
      : intent.action === 'search' || intent.action === 'unsupported'
        ? matchBuildingQuestion(message)
        : undefined;
  if (asked) {
    const answer = answerBuildingQuestion(asked, building, {
      origin,
      currentFloor: context.floor,
      accessible: state.stepFree,
      blocked,
    });
    if (answer?.fallbackQuery)
      intent = { ...intent, action: 'search', query: answer.fallbackQuery };
    else if (answer)
      return reply(answer.text, answer.rooms.map(candidate), answer.scan ? 'scan' : undefined);
    else if (intent.action === 'question')
      return reply(
        'I could not work out which floor or place you mean. Try a floor name or a place name.',
      );
  }
  // "Route from the first floor to the second floor": explicit endpoints, either of which may be
  // a floor, a place, or a landing. An unknown destination falls through to a search.
  const routeRequest =
    intent.action === 'route'
      ? { from: intent.routeFrom, to: intent.routeTo ?? '' }
      : intent.action === 'search'
        ? matchRouteRequest(intent.query)
        : undefined;
  if (routeRequest) {
    const destination = resolveEndpoint(routeRequest.to, building, context.floor);
    if (!destination) {
      intent = { ...intent, action: 'search', query: routeRequest.to };
    } else {
      const startEndpoint = routeRequest.from
        ? resolveEndpoint(routeRequest.from, building, context.floor)
        : undefined;
      if (routeRequest.from && !startEndpoint)
        return reply(
          `I do not know a place or floor called “${routeRequest.from}” in ${building.name}. Try a floor name or a place from the directory.`,
        );
      if (!startEndpoint && !origin)
        return reply('Scan a checkpoint so I can route from your position.', [], 'scan');
      const endpointOf = (endpoint: ResolvedEndpoint) =>
        endpoint.kind === 'floor'
          ? { floor: endpoint.floor.id }
          : endpoint.kind === 'connection'
            ? { connection: endpoint.connection }
            : { node: endpoint.node };
      const labelOf = (endpoint: ResolvedEndpoint) =>
        endpoint.kind === 'floor' ? endpoint.floor.name : endpoint.label;
      const path = routeBetween(
        building,
        startEndpoint ? endpointOf(startEndpoint) : { node: origin },
        endpointOf(destination),
        { accessible: state.stepFree, blocked },
      );
      const fromLabel = startEndpoint
        ? labelOf(startEndpoint)
        : (building.nodes.find((node) => node.id === origin)?.label ?? 'your position');
      const toLabel = labelOf(destination);
      if (!path)
        return reply(
          `There is no permitted${state.stepFree ? ' step-free' : ''} route from ${fromLabel} to ${toLabel}.`,
        );
      const via = [...new Set(path.edges.map((edge) => edge.kind))].filter(
        (kind) => kind === 'elevator' || kind === 'stairs',
      );
      if (!path.edges.length)
        return reply(`You are already at ${toLabel}. Tell me where to go next.`);
      const start = path.nodes[0];
      const end = path.nodes.at(-1)!;
      return {
        text: `Route from ${fromLabel} to ${toLabel}: start at ${start.label}${via.length ? `, ${via.includes('elevator') ? 'take the elevator' : 'use the stairs'}` : ''}, about ${Math.round(path.distance)} m to ${end.label}${state.stepFree ? ' using step-free connections' : ''}.`,
        choices: [],
        state,
        action: 'route',
        routeStartId: start.id,
        routeTargetId: end.id,
        routeLabel: `${fromLabel} → ${toLabel}`,
      };
    }
  }
  // "Take me to the 2nd floor": the model may also phrase this as a search for "floor 2".
  const floorRequest =
    intent.action === 'floor'
      ? {
          floor: building.floors.find((floor) => floor.id === intent.floorId),
          requested: intent.floorLabel ?? 'that floor',
        }
      : intent.action === 'search'
        ? matchFloor(intent.query, building.floors, context.floor)
        : undefined;
  if (floorRequest) {
    const target = floorRequest.floor;
    if (!target)
      return reply(
        `${building.name} has no ${floorRequest.requested}. Its floors are ${building.floors.map((floor) => floor.name).join(', ')}.`,
      );
    const start = building.nodes.find((node) => node.id === origin);
    if (!start) return reply(`Scan a checkpoint so I can route you to ${target.name}.`, [], 'scan');
    if (start.floor === target.id)
      return {
        text: `You are already on ${target.name}. Tell me a place on this floor and I will find the route.`,
        choices: [],
        state,
        action: 'floor',
        floorId: target.id,
      };
    const path = routeToFloor(building, origin!, target.id, {
      accessible: state.stepFree,
      blocked,
    });
    if (!path)
      return reply(
        `There is no permitted${state.stepFree ? ' step-free' : ''} route to ${target.name} from this starting point.`,
      );
    const via = [...path.edges]
      .reverse()
      .find((edge) => edge.kind === 'elevator' || edge.kind === 'stairs');
    return {
      text: `Route to ${target.name}: ${via?.kind === 'elevator' ? 'take the elevator' : 'use the stairs'} from ${start.label}, about ${Math.round(path.distance)} m${state.stepFree ? ' using step-free connections' : ''}.`,
      choices: [],
      state,
      action: 'floor',
      floorId: target.id,
    };
  }
  // "Where is the elevator?": route to the nearest landing on the visitor's floor.
  const connectionRequest =
    intent.action === 'connection'
      ? {
          kind: intent.connectionKind ?? 'elevator',
          requested: intent.connectionLabel ?? 'elevator',
        }
      : intent.action === 'search'
        ? matchConnection(intent.query)
        : undefined;
  if (connectionRequest) {
    const start = building.nodes.find((node) => node.id === origin);
    if (!start)
      return reply(
        `Scan a checkpoint so I can find the nearest ${connectionRequest.requested} from where you are.`,
        [],
        'scan',
      );
    const path = routeToConnection(building, origin!, connectionRequest.kind, {
      accessible: state.stepFree,
      blocked,
    });
    if (!path)
      return reply(
        building.floors.length === 1
          ? `${building.name} is a single-floor map with no mapped elevators or stairs.`
          : `There is no permitted route to a ${connectionRequest.requested} from this starting point.`,
      );
    const landing = path.nodes.at(-1)!;
    const note =
      connectionRequest.requested === 'escalator'
        ? ' This demo maps escalators as stairs connections.'
        : '';
    return {
      text: `The nearest ${connectionRequest.requested} from ${start.label} is ${landing.label}, about ${Math.round(path.distance)} m.${note}`,
      choices: [],
      state,
      action: 'connection',
      nodeId: landing.id,
      nodeLabel: landing.label,
    };
  }
  if (intent.action === 'choose') {
    const room = building.rooms.find((room) => room.id === state.choices[intent.choice - 1]);
    if (!room)
      return reply('Choose a destination from the latest suggestions, or tell me what you need.');
    const choice = candidate(room);
    return reply(
      choice.reachable
        ? `Ready to show the mapped route to ${room.name}${state.stepFree ? ' using step-free connections' : ''}.`
        : `There is no permitted${state.stepFree ? ' step-free' : ''} route to ${room.name} from this starting point.`,
      [choice],
      origin ? undefined : 'scan',
    );
  }
  const isRefine = intent.action === 'refine';
  // A preference change while a route is on screen re-plans that route rather than a new search.
  if (
    isRefine &&
    context.routeTo &&
    !/\b(another|something else|different|closer|nearest)\b/i.test(message)
  ) {
    const destination = context.routeTo;
    const choice = candidate(destination);
    state.choices = [destination.id];
    return reply(
      choice.reachable
        ? `Your route to ${destination.name} now ${state.stepFree ? 'uses step-free connections such as elevators instead of stairs' : 'may use stairs'}. The directions on the map are updated${choice.distance !== undefined ? `, about ${Math.round(choice.distance)} m` : ''}.`
        : `There is no permitted${state.stepFree ? ' step-free' : ''} route to ${destination.name} from this starting point. Try another destination or ask staff for assistance.`,
      [choice],
      origin ? undefined : 'scan',
    );
  }
  // "nearest restroom on floor 7": the floor limits the candidates; the model may have dropped it.
  const fromMessage = isRefine
    ? { text: message }
    : splitFloorQualifier(message, building.floors, context.floor);
  const fromQuery = isRefine
    ? { text: state.query }
    : splitFloorQualifier(intent.query, building.floors, context.floor);
  const limitFloor = fromQuery.floor ?? fromMessage.floor;
  const query = (isRefine ? state.query : fromQuery.text).trim();
  if (!query)
    return reply(
      state.stepFree
        ? 'Step-free routing is on: routes will use elevators instead of stairs. Where would you like to go?'
        : 'What place would you like to find?',
    );
  if (!isRefine) {
    state.excluded = [];
    state.nearest = false;
  }
  if (isRefine && /\b(another|something else|different)\b/i.test(message))
    state.excluded = [...new Set([...state.excluded, ...state.choices])];
  state.query = query;
  state.nearest ||= intent.nearest;
  const exact = building.rooms.filter((room) =>
    [room.name, ...room.aliases].some((name) => normal(name) === normal(query)),
  );
  const ranked = exact.length ? exact.map((room) => ({ room, score: 1 })) : await search(query);
  let relevant = relevantMatches(ranked).filter(({ room }) => !state.excluded.includes(room.id));
  let floorNote = '';
  if (limitFloor) {
    const onFloor = relevant.filter(({ room }) => room.floor === limitFloor.id);
    if (onFloor.length) relevant = onFloor;
    else if (relevant.length)
      floorNote = ` Nothing matching is mapped on ${limitFloor.name}; these are the closest elsewhere.`;
  }
  let choices = relevant.map(({ room }) => candidate(room)).filter((choice) => choice.reachable);
  if (state.nearest && origin) choices.sort((a, b) => a.distance! - b.distance!);
  choices = dedupeByName(choices);
  const offered = choices.slice(0, 3);
  state.choices = offered.map(({ room }) => room.id);
  if (!offered.length) {
    const need = expandNeed(query);
    return reply(
      relevant.length
        ? `I found matching places, but no permitted${state.stepFree ? ' step-free' : ''} route from this starting point. Try another destination or review your reported blocked connections.`
        : need.facility
          ? `${building.name} has no mapped ${need.label} in this demo map. Staff at an information desk may help; otherwise tell me a store or service to find.`
          : `I could not find a strong${isRefine ? ' additional' : ''} match for “${query}” in this map. Try a place name or browse the directory.`,
    );
  }
  const position = sample ? 'the demo starting point' : 'your last scanned checkpoint';
  return reply(
    `${state.nearest && origin ? `These are the closest matching mapped places${limitFloor && !floorNote ? ` on ${limitFloor.name}` : ''} from ${position}` : limitFloor && !floorNote ? `Here are matching places on ${limitFloor.name}` : 'Here are matching places in this building'}${state.stepFree ? ' with step-free routing selected' : ''}. Choose one to see directions.${!origin ? ' Scan a checkpoint first to calculate distances.' : ''}${floorNote}`,
    offered,
    origin ? undefined : 'scan',
  );
}

/** One suggestion per place name: a store on three floors shows once, nearest floor first. */
export function dedupeByName(choices: ChatChoice[]) {
  const best = new Map<string, ChatChoice>();
  for (const choice of choices) {
    const seen = best.get(choice.room.name);
    if (
      !seen ||
      (choice.distance !== undefined &&
        (seen.distance === undefined || choice.distance < seen.distance))
    )
      best.set(choice.room.name, choice);
  }
  return choices.filter((choice) => best.get(choice.room.name) === choice);
}
