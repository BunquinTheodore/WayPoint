import { isNative } from './bridge';
import { interpretChat, stopChat } from './chat-runtime';
import { explicitRoutePreferences, stripRoutePreferences } from './chat-intent';
import { localizeMessage } from './taglish';
import {
  answerNavigation,
  emptyChat,
  simpleIntent,
  type ChatContext,
  type ChatChoice,
  type SearchDestinations,
} from './navigation-chat';
import type { Room } from './types';

export function mountChat(options: {
  host: HTMLElement;
  context: () => ChatContext | undefined;
  search: SearchDestinations;
  navigate: (room: Room, stepFree: boolean) => void;
  setAccessible: (value: boolean) => void;
  scan: () => void;
  evacuation: () => void;
  switchBuilding: (id: string) => void;
  goToFloor: (id: number) => void;
  goToNode: (id: string) => void;
  planRoute: (startId: string, targetId: string, label: string) => void;
}) {
  const panel = document.createElement('section');
  panel.className = 'chat-panel';
  panel.id = 'waypoint-chat';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ask Waypoint');
  panel.innerHTML = `<header class="chat-header"><div><strong>Ask Waypoint</strong><span id="chat-mode">Private · English · Offline navigation</span></div><button type="button" class="icon-button" data-chat-close aria-label="Close chat">×</button></header><div class="chat-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div><div class="chat-suggestions"><button type="button">Find coffee</button><button type="button">Nearest restroom</button><button type="button">Avoid stairs</button></div><form class="chat-compose"><label class="sr-only" for="chat-message">Ask for a place or directions</label><input id="chat-message" placeholder="Where would you like to go?" maxlength="500" autocomplete="off"/><button type="submit" aria-label="Send message">Send</button><button type="button" data-chat-stop hidden>Stop</button></form><footer class="chat-footer"><span>Routes use the saved demo map.</span><button type="button" data-chat-clear>New chat</button></footer>`;
  options.host.append(panel);
  const find = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const log = find<HTMLDivElement>('.chat-messages');
  const input = find<HTMLInputElement>('input');
  const send = find<HTMLButtonElement>('[type="submit"]');
  const stop = find<HTMLButtonElement>('[data-chat-stop]');
  const mode = find<HTMLSpanElement>('#chat-mode');
  let state = emptyChat();
  let generation = 0;
  let controller: AbortController | undefined;
  let lastFocus: HTMLElement | null = null;
  let working = false;
  const scroll = () => {
    log.scrollTop = log.scrollHeight;
  };
  function message(text: string, user = false) {
    const item = document.createElement('div');
    item.className = `chat-message ${user ? 'chat-user' : 'chat-assistant'}`;
    const body = document.createElement('p');
    body.textContent = text;
    item.append(body);
    log.append(item);
    // Keep the session bounded on devices with limited memory.
    while (log.childElementCount > 30) log.firstElementChild?.remove();
    scroll();
    return item;
  }
  function setBusy(value: boolean) {
    working = value;
    send.hidden = value;
    stop.hidden = !value;
    input.disabled = value;
    panel.querySelectorAll<HTMLButtonElement>('.chat-suggestions button').forEach((button) => {
      button.disabled = value;
    });
  }
  function cancel() {
    generation++;
    controller?.abort();
    controller = undefined;
    stopChat();
    log.querySelector('[data-pending]')?.remove();
    setBusy(false);
  }
  function reset() {
    cancel();
    state = emptyChat(options.context()?.building.id);
    log.replaceChildren();
    message(
      'Hi, I’m your building guide. Tell me a place or what you need, and I’ll help you find it. You can ask for a closer option or a step-free route.',
    );
    mode.textContent = 'Private · English · Offline navigation';
    input.value = '';
  }
  function close() {
    panel.hidden = true;
    lastFocus?.focus();
    document
      .querySelector('[aria-controls="waypoint-chat"]')
      ?.setAttribute('aria-expanded', 'false');
  }
  function offer(parent: HTMLElement, choice: ChatChoice, stepFree: boolean, buildingId: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-choice';
    const context = options.context();
    const floor =
      context?.building.floors.find((floor) => floor.id === choice.room.floor)?.name ??
      'Mapped floor';
    const label = document.createElement('strong');
    label.textContent = choice.room.name;
    const detail = document.createElement('span');
    detail.textContent = `${floor}${choice.distance !== undefined ? ` · ~${Math.round(choice.distance)} m` : ''}${stepFree ? ' · Step-free' : ''} · ${choice.reachable ? 'Show route' : 'No permitted route'}`;
    button.append(label, detail);
    button.disabled = !choice.reachable;
    button.onclick = () => {
      if (working) return;
      const current = options.context();
      if (!current || current.building.id !== buildingId) return;
      // The app recalculates using the CURRENT checkpoint and blocked edges.
      options.navigate(choice.room, stepFree);
      close();
    };
    parent.append(button);
  }
  async function submit(text: string) {
    const context = options.context();
    if (!context || working || !text.trim()) return;
    if (state.buildingId !== context.building.id) reset();
    message(text, true);
    input.value = '';
    // Filipino and Taglish are understood through a word-level translation; the log keeps the
    // visitor's own words.
    const localized = localizeMessage(text).text;
    setBusy(true);
    const pending = message('Understanding your request…');
    pending.dataset.pending = '';
    const turn = ++generation;
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => {
      requestController.abort();
      stopChat();
    }, 60_000);
    try {
      let intent = simpleIntent(
        localized,
        state.query,
        context.building.id,
        context.building.floors,
        context.floor,
      );
      if (!intent) {
        try {
          intent = await interpretChat(
            {
              message: localized,
              previousQuery: state.query,
              choices: state.choices
                .map((id) => context.building.rooms.find((room) => room.id === id)?.name ?? '')
                .map((name) => name.slice(0, 160)),
            },
            controller.signal,
          );
          mode.textContent = isNative()
            ? 'Local assistant · On this phone'
            : 'Local assistant · On this computer';
        } catch (error) {
          if (turn !== generation || requestController.signal.aborted) throw error;
          mode.textContent = 'Local destination search · Limited conversation';
          const preferences = explicitRoutePreferences(localized);
          intent = {
            action: 'search',
            query: (stripRoutePreferences(localized) || localized).slice(0, 200),
            stepFree: preferences.stepFree,
            nearest: preferences.nearest,
            choice: 0,
          };
          pending.querySelector('p')!.textContent =
            'The chat interpreter is unavailable. Searching saved destinations on your device…';
        }
      }
      if (turn !== generation || requestController.signal.aborted) return;
      const latestContext = options.context();
      if (!latestContext || latestContext.building.id !== context.building.id) return;
      const response = await answerNavigation(
        localized,
        intent,
        state,
        latestContext,
        options.search,
      );
      if (turn !== generation) return;
      if (requestController.signal.aborted) throw new Error('Request timed out.');
      const current = options.context();
      if (
        !current ||
        current.origin !== latestContext.origin ||
        current.accessible !== latestContext.accessible ||
        [...current.blocked].sort().join('|') !== [...latestContext.blocked].sort().join('|')
      ) {
        pending.remove();
        message(
          'Your starting point or route preferences changed. Ask again to refresh these directions.',
        );
        return;
      }
      state = response.state;
      if (response.action === 'building' && response.buildingId) {
        pending.remove();
        message(response.text);
        close();
        options.switchBuilding(response.buildingId);
        return;
      }
      options.setAccessible(state.stepFree);
      pending.remove();
      const item = message(response.text);
      for (const choice of response.choices)
        offer(item, choice, state.stepFree, context.building.id);
      if (response.action) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'chat-choice';
        const floorName =
          context.building.floors.find((floor) => floor.id === response.floorId)?.name ??
          'that floor';
        action.textContent =
          response.action === 'scan'
            ? 'Scan a checkpoint'
            : response.action === 'floor'
              ? `Show ${floorName} on the map`
              : response.action === 'connection'
                ? `Show route to ${response.nodeLabel ?? 'it'}`
                : response.action === 'route'
                  ? `Show route ${response.routeLabel ?? ''}`.trim()
                  : 'Open evacuation guide';
        action.onclick = () => {
          close();
          if (response.action === 'scan') options.scan();
          else if (response.action === 'floor' && response.floorId !== undefined)
            options.goToFloor(response.floorId);
          else if (response.action === 'connection' && response.nodeId)
            options.goToNode(response.nodeId);
          else if (response.action === 'route' && response.routeStartId && response.routeTargetId)
            options.planRoute(
              response.routeStartId,
              response.routeTargetId,
              response.routeLabel ?? '',
            );
          else options.evacuation();
        };
        item.append(action);
      }
      scroll();
    } catch {
      if (turn === generation) {
        pending.remove();
        message('That request did not finish. Try a shorter place name, or use the directory.');
      }
    } finally {
      clearTimeout(timeout);
      if (turn === generation) {
        setBusy(false);
        controller = undefined;
        if (!panel.hidden) input.focus();
      }
    }
  }
  find<HTMLFormElement>('form').onsubmit = (event) => {
    event.preventDefault();
    void submit(input.value.trim());
  };
  find<HTMLButtonElement>('[data-chat-close]').onclick = close;
  find<HTMLButtonElement>('[data-chat-clear]').onclick = () => {
    reset();
    input.focus();
  };
  stop.onclick = () => {
    cancel();
    message('Request stopped.');
    input.focus();
  };
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  panel.querySelectorAll<HTMLButtonElement>('.chat-suggestions button').forEach((button) => {
    button.onclick = () => void submit(button.textContent ?? '');
  });
  reset();
  return {
    reset,
    open: () => {
      if (state.buildingId !== options.context()?.building.id) reset();
      lastFocus = document.activeElement as HTMLElement;
      panel.hidden = false;
      document
        .querySelector('[aria-controls="waypoint-chat"]')
        ?.setAttribute('aria-expanded', 'true');
      input.focus();
      scroll();
    },
  };
}
