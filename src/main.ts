import './style.css';
import { createIcons } from 'lucide';
import { iconSet } from './icons';
import { strFromU8, zipSync } from 'fflate';
import type { BuildingViewer, ZoomMode } from './viewer';
import { FloorWheel } from './floor-wheel';
import {
  route,
  routeToFloor,
  routeToConnection,
  routeBetween,
  evacuationRoute,
  routeSteps,
  parseCheckpoint,
} from './routing';
import { verifyPackage, savePackage, loadPackage, removePackage } from './packages';
import { semanticSearch, warmUp } from './ai';
import { mountChat } from './chat-ui';
import {
  classifyQuery,
  matchRouteRequest,
  offTopicReply,
  relevantMatches,
  splitFloorQualifier,
} from './query-guard';
import { expandNeed } from './needs';
import { localizeMessage } from './taglish';
import { explicitRoutePreferences, stripRoutePreferences } from './chat-intent';
import {
  answerBuildingQuestion,
  entranceNode,
  matchBuildingQuestion,
  resolveEndpoint,
  type ResolvedEndpoint,
} from './building-facts';
import { isNative, nativeRequest, fromBase64, toBase64 } from './bridge';
import trust from './generated/package-key.json';
import type { Building, StoredPackage, Room, Route, Checkpoint } from './types';
import { demos, defaultBuildingId, supportedBuildingIds, demoPackagePath } from './demos';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
document.querySelector('#app')!.innerHTML = `
  <aside class="sidebar" id="navigation" aria-label="Building navigation">
    <button class="sidebar-close icon-button" id="close-menu" aria-label="Close navigation">${icon('x')}</button>
    <button class="building-card" id="building-picker" aria-label="Choose demo building"><span class="building-art">${icon('building-2')}</span><div><strong id="building-name">${esc(demos.find((demo) => demo.id === defaultBuildingId)!.name)}</strong><span id="building-subtitle">Choose a demo building</span></div>${icon('chevrons-up-down')}</button>
    <nav class="sidebar-nav"><button class="nav-item active" id="explore-tab">${icon('map')}Explore</button><button class="nav-item" id="directory-tab">${icon('layout-grid')}Directory</button><button class="nav-item" id="package-tab">${icon('hard-drive-download')}Offline buildings</button><span class="nav-divider"></span><button class="nav-item" id="demos-tab">${icon('building-2')}Demos</button><button class="nav-item" id="help-tab">${icon('circle-help')}Help</button></nav>
    <div class="sidebar-directory" id="sidebar-directory"><div class="section-caption">ON THIS FLOOR <span id="room-count">6 rooms</span></div><div id="directory-list"></div></div>
    <div class="sidebar-bottom"><div class="offline-note">${icon('shield-check')}<div><strong>Made to work offline</strong><span>Maps & AI stay on your device.</span></div></div><button class="emergency-link" id="evacuate-side">${icon('door-open')}Evacuation guide${icon('arrow-up-right')}</button><span class="demo-caption">ILLUSTRATIVE LAYOUT · HACKATHON DEMO</span></div>
  </aside>
  <button class="nav-overlay" id="nav-overlay" aria-label="Close navigation" tabindex="-1"></button>
  <main class="main">
    <section class="map-area" aria-label="Building explorer"><div id="viewer"></div><div id="labels"></div>
      <button class="menu-button icon-button" id="open-menu" aria-label="Open navigation" aria-controls="navigation" aria-expanded="false">${icon('menu')}</button>
      <div class="map-context breadcrumb"><span>EXPLORE</span><span aria-hidden="true">/</span><strong id="header-building">${esc(demos.find((demo) => demo.id === defaultBuildingId)!.name)}</strong></div>
      <button class="scan-button" id="scan-top" aria-label="Scan checkpoint">${icon('scan-line')}<span>Scan checkpoint</span></button>
      <button class="chat-launch" id="chat-open" aria-label="Ask Waypoint for directions" aria-controls="waypoint-chat" aria-expanded="false">${icon('message-circle')}<span>Ask Waypoint</span></button>
      <div class="map-heading"><span class="eyebrow">EXPLORE AT YOUR OWN PACE</span><h2 id="map-title">Find your way.</h2><p id="map-subtitle">Choose a floor. Find a destination.</p></div>
      <button class="view-chip" id="explode-view" aria-label="Toggle interior floor stack" aria-pressed="true">${icon('box')}<span id="view-label">Whole building</span><span class="chip-divider"></span><span class="live-dot"></span>3D</button>
      <div class="floor-control"><span>FLOOR</span><div class="floor-buttons"></div></div>
      <div class="camera-controls"><button id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><button id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span></span><button id="overview" aria-label="Show whole building">${icon('maximize')}</button><button id="flat-view" aria-label="Toggle top-down view">${icon('layers')}</button></div>
      <a id="map-attribution" class="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" hidden>© OpenStreetMap contributors</a>
      <div class="north-indicator">N<span>↑</span></div>
      <div class="gesture-hint" id="gesture-hint">${icon('hand')}<span>Drag to rotate <b>·</b> Pinch to explore</span></div>
      <div class="receive-hint" id="receive-hint" hidden><span>${icon('building-2')}</span><strong>A map for your next step.</strong><p>Receive the building directly from its local Wi-Fi.</p><button class="primary-button" id="receive-first">${icon('scan-line')}Scan entrance QR</button></div>
      <div class="map-loading" id="map-loading"><span class="loader"></span><strong>Preparing your building</strong><span>A little space to find your way.</span></div>
      <div class="search-card" id="search-card">
        <button class="search-panel-toggle" id="toggle-search-panel" aria-label="Minimize destination panel" aria-expanded="true" aria-controls="search-panel-body"><span class="panel-handle" aria-hidden="true"></span><span class="panel-toggle-label">Find a destination</span>${icon('chevron-down')}</button>
        <div class="search-panel-body" id="search-panel-body">
        <div class="search-content">
          <div class="search-title"><h3>Where would you like to go?</h3><span class="local-ai-badge">On-device AI</span></div>
          <form id="search-form"><label class="sr-only" for="destination-input">Search for a room or describe what you need</label><div class="search-field">${icon('search')}<input id="destination-input" placeholder="Find a place or ask a question…" autocomplete="off" maxlength="500"/></div><button type="submit" aria-label="Find destinations">${icon('arrow-up')}</button></form>
          <div class="quick-destinations"></div><div id="search-results" hidden></div>
        </div>
        <aside class="route-preview" id="route-preview" aria-label="Suggested route" hidden></aside>
        </div>
      </div>
      <div class="route-card" id="route-card" hidden></div>
      <div class="selection-dock" id="selection-dock">
        <div class="location-card"><span class="location-dot"></span><div><strong id="location-label">Sample starting point</strong><span id="location-detail">Main entrance · demo position</span></div><button id="locate-button" aria-label="Focus starting point or last confirmed location">${icon('locate-fixed')}</button></div>
        <div class="selection-card" id="selection-card" hidden></div>
      </div>
    </section>
  </main>
  <div class="modal-backdrop" id="modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title"></h2><button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('x')}</button></div><div id="modal-body"></div></section></div>
  <div class="toast" id="toast" role="status" hidden></div>`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.7 } });
refreshIcons();
$('#toggle-search-panel').onclick = () => {
  const body = $('#search-panel-body');
  body.hidden = !body.hidden;
  $('#search-card').classList.toggle('collapsed', body.hidden);
  $('#toggle-search-panel').setAttribute('aria-expanded', String(!body.hidden));
  $('#toggle-search-panel').setAttribute(
    'aria-label',
    body.hidden ? 'Expand destination panel' : 'Minimize destination panel',
  );
};
let building: Building | undefined;
let currentPackage: StoredPackage | undefined;
let currentArchive: Uint8Array | undefined;
let embeddings: Record<string, number[]> = {};
let origin: string | undefined;
let confirmedAt: string | undefined;
let currentFloor = 0;
let selected: Room | undefined;
let floorTarget: number | undefined;
let nodeTarget: { id: string; label: string } | undefined;
/** Explicit starting point for "route from A to B"; otherwise routes start at the checkpoint. */
let routeStart: { id: string; label: string } | undefined;
let path: Route | null = null;
let accessible = false;
let emergency = false;
let blocked = new Set<string>();
let viewer: BuildingViewer | undefined;
let floorWheel: FloorWheel | undefined;
let sample = !isNative();
let cameraStream: MediaStream | undefined;
let scanRunning = false;
let scanningFrame = 0;
let lastFocus: HTMLElement | null = null;
let searchSequence = 0;
let switchingBuilding = false;
const chat = mountChat({
  host: $('.map-area'),
  context: () =>
    building
      ? {
          building,
          origin,
          sample,
          accessible,
          blocked: new Set(blocked),
          routeTo: path && !emergency && selected ? selected : undefined,
          floor: currentFloor,
        }
      : undefined,
  search: (query) =>
    building
      ? semanticSearch(query, building.rooms, embeddings, building.rooms.length)
      : Promise.resolve([]),
  navigate: (room, stepFree) => {
    accessible = stepFree;
    chooseRoom(room);
    startRoute(false);
  },
  setAccessible: (value) => {
    if (accessible !== value) {
      accessible = value;
      if (path) startRoute(emergency);
    }
  },
  scan: () => void scan(),
  evacuation,
  switchBuilding: (id) => void switchDemo(id),
  goToFloor,
  goToNode,
  planRoute,
});
$('#chat-open').onclick = () => chat.open();
const mobileLayout = window.matchMedia('(max-width: 760px)');
let menuOpen = false;
let lastLayoutFocus: Element | null = document.activeElement;
document.addEventListener('focusin', (event) => {
  lastLayoutFocus = event.target instanceof Element ? event.target : null;
});
function closeMenu(restoreFocus = true) {
  menuOpen = false;
  document.body.classList.remove('nav-open');
  $('#open-menu').setAttribute('aria-expanded', String(!mobileLayout.matches));
  $('#navigation').inert = mobileLayout.matches;
  $('#navigation').removeAttribute('role');
  $('#navigation').removeAttribute('aria-modal');
  $('.main').inert = false;
  if (restoreFocus && mobileLayout.matches) $('#open-menu').focus();
}
$('#open-menu').onclick = () => {
  if (!mobileLayout.matches) return;
  menuOpen = true;
  document.body.classList.add('nav-open');
  $('#open-menu').setAttribute('aria-expanded', 'true');
  $('#navigation').inert = false;
  $('#navigation').setAttribute('role', 'dialog');
  $('#navigation').setAttribute('aria-modal', 'true');
  $('.main').inert = true;
  $('#close-menu').focus();
};
$('#close-menu').onclick = () => closeMenu();
$('#nav-overlay').onclick = () => closeMenu();
$('#navigation').addEventListener(
  'click',
  (event) => {
    if (menuOpen && (event.target as HTMLElement).closest('button')) closeMenu();
  },
  true,
);
mobileLayout.addEventListener('change', () => {
  // CSS can hide the focused control before the media-query event arrives.
  const focus = document.activeElement === document.body ? lastLayoutFocus : document.activeElement;
  closeMenu(false);
  if (mobileLayout.matches && $('#navigation').contains(focus)) $('#open-menu').focus();
  else if (!mobileLayout.matches && (focus === $('#open-menu') || focus === $('#close-menu')))
    $('#explore-tab').focus();
});
closeMenu(false);
function fitViewport() {
  $('#app').style.height = `${window.visualViewport?.height ?? window.innerHeight}px`;
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.addEventListener('resize', fitViewport);
fitViewport();
// Frame the building and location controls above panels on the full-screen map.
const dockObserver = new ResizeObserver(() => {
  const panel = !$('#route-card').hidden
    ? $('#route-card')
    : !$('#selection-card').hidden
      ? $('#selection-dock')
      : $('#search-card');
  const height = panel.hidden
    ? 0
    : $('.map-area').getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
  $('.map-area').style.setProperty('--dock-height', `${height}px`);
  viewer?.refreshViewport();
});
for (const id of ['#search-card', '#route-card', '#selection-card', '#selection-dock'])
  dockObserver.observe($(id));

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  setTimeout(() => {
    $('#toast').hidden = true;
  }, 5500);
}
function modal(title: string, html: string) {
  lastFocus = document.activeElement as HTMLElement;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  refreshIcons();
  $('#close-modal').focus();
}
function closeModal() {
  scanRunning = false;
  cancelAnimationFrame(scanningFrame);
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = undefined;
  $('#modal').hidden = true;
  lastFocus?.focus();
}
$('#close-modal').onclick = closeModal;
$('#modal').onclick = (e) => {
  if (e.target === $('#modal')) closeModal();
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (menuOpen) closeMenu();
    else closeModal();
  }
  if (e.key === 'Tab' && (menuOpen || !$('#modal').hidden)) {
    const buttons = Array.from(
      (menuOpen ? $('#navigation') : $('#modal')).querySelectorAll<HTMLElement>(
        'button,input,select,a[href],textarea',
      ),
    ).filter((el) => !el.hasAttribute('disabled') && !el.hidden);
    const first = buttons[0],
      last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});

$('#viewer').addEventListener('viewer-error', showFallback);
function showFallback() {
  viewer?.dispose();
  viewer = undefined;
  $('#labels').replaceChildren();
  $('#viewer').innerHTML =
    '<div class="fallback-map"><h3>Floor map</h3><p>3D is unavailable. Rooms and written directions remain usable.</p><div id="flat-rooms"></div></div>';
  renderDirectory();
}
function updateMode(mode: ZoomMode) {
  $('#explode-view').setAttribute('aria-pressed', String(viewer?.isExploded ?? false));
  $('#view-label').textContent =
    mode === 'building'
      ? viewer?.isExploded
        ? 'Floor stack'
        : 'Whole building'
      : mode === 'floor'
        ? (building?.floors.find((f) => f.id === currentFloor)?.name ?? 'Floor view')
        : 'Room detail';
  $('#map-title').textContent =
    mode === 'building'
      ? 'Find your way.'
      : mode === 'floor'
        ? 'Explore this floor.'
        : 'Your destination.';
  $('#gesture-hint').classList.toggle('quiet', mode === 'room');
}
function setFloor(f: number, focus = true, alignWheel = true) {
  currentFloor = f;
  if (selected && selected.floor !== f) {
    selected = undefined;
    $('#selection-card').hidden = true;
    if ($('#route-card').hidden) $('#search-card').hidden = false;
    viewer?.clearSelection();
  }
  document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((b) => {
    const active = Number(b.dataset.floor) === f;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  if (alignWheel) floorWheel?.center(f);
  viewer?.setFloor(f, focus);
  if (focus) updateMode('floor');
  renderDirectory();
}
function renderDirectory() {
  if (!building) return;
  const rooms = building.rooms.filter((r) => r.floor === currentFloor);
  $('#room-count').textContent = `${rooms.length} rooms`;
  $('#directory-list').innerHTML = rooms
    .map(
      (r) =>
        `<button class="directory-room" data-room="${esc(r.id)}"><span class="room-category ${esc(r.category)}">${icon(r.category === 'food' ? 'coffee' : r.category === 'health' ? 'heart-pulse' : r.category === 'facilities' ? 'accessibility' : r.name === 'Library' ? 'book-open' : 'door-closed')}</span><span>${esc(r.name)}</span>${icon('chevron-right')}</button>`,
    )
    .join('');
  $('#flat-rooms')?.replaceChildren(
    ...rooms.map((r) => {
      const b = document.createElement('button');
      b.textContent = r.name;
      b.onclick = () => chooseRoom(r);
      return b;
    }),
  );
  refreshIcons();
}
/** Route to the nearest stairs or elevator landing on a floor, or just show it when already there. */
function goToFloor(id: number) {
  if (!building) return;
  const floorName = building.floors.find((floor) => floor.id === id)?.name ?? 'that floor';
  const start = building.nodes.find((node) => node.id === origin);
  if (start && start.floor === id) {
    toast(`You are already on ${floorName}.`);
    setFloor(id);
    return;
  }
  selected = undefined;
  nodeTarget = undefined;
  floorTarget = id;
  startRoute(false);
}
/** Route to a specific graph node such as an elevator or stairs landing. */
function goToNode(id: string) {
  const node = building?.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  selected = undefined;
  floorTarget = undefined;
  routeStart = undefined;
  nodeTarget = { id: node.id, label: node.label };
  startRoute(false);
}
/** Route between an explicit start node and a target node, e.g. "from Level 1 to Level 2". */
function planRoute(startId: string, targetId: string, label: string) {
  const start = building?.nodes.find((candidate) => candidate.id === startId);
  const target = building?.nodes.find((candidate) => candidate.id === targetId);
  if (!start || !target) return;
  selected = undefined;
  floorTarget = undefined;
  routeStart = { id: start.id, label: start.label };
  nodeTarget = { id: target.id, label: label || target.label };
  startRoute(false);
}
/** Route to the nearest elevator or stairs from the visitor's checkpoint. */
function goToConnection(kind: 'elevator' | 'stairs', requested: string) {
  if (!building) return;
  if (!origin) {
    toast('Scan a checkpoint to confirm your starting location.');
    void scan();
    return;
  }
  const found = routeToConnection(building, origin, kind, { accessible, blocked });
  if (!found) {
    toast(
      building.floors.length === 1
        ? `${building.name} is a single-floor map with no mapped elevators or stairs.`
        : `No permitted route to a ${requested} from this starting point.`,
    );
    return;
  }
  goToNode(found.nodes.at(-1)!.id);
}
function chooseRoom(room: Room) {
  selected = room;
  floorTarget = undefined;
  nodeTarget = undefined;
  routeStart = undefined;
  path = null;
  emergency = false;
  viewer?.setRoute(null);
  $('#route-card').hidden = true;
  $('#search-card').hidden = true;
  setFloor(room.floor, false);
  viewer?.focusRoom(room);
  $('#selection-card').hidden = false;
  $('#selection-card').innerHTML =
    `<div class="selection-heading"><span class="room-category ${esc(room.category)}">${icon(room.name === 'Library' ? 'book-open' : 'door-open')}</span><div><span class="eyebrow">${esc(building!.floors[room.floor].name)}</span><h3>${esc(room.name)}</h3></div><button id="close-selection" class="icon-button" aria-label="Close room details">${icon('x')}</button></div><p>${esc(room.description)}</p><button id="navigate-button" class="primary-button">${icon('navigation')}Take me there${icon('arrow-right')}</button>`;
  $('#close-selection').onclick = () => {
    selected = undefined;
    $('#selection-card').hidden = true;
    $('#search-card').hidden = false;
    viewer?.clearSelection();
    renderRoutePreview();
  };
  $('#navigate-button').onclick = () => startRoute(false);
  refreshIcons();
}
document.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-room]');
  if (button && building) {
    const room = building.rooms.find((r) => r.id === button.dataset.room);
    if (room) chooseRoom(room);
  }
  const quick = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-quick]');
  if (quick && building) {
    const room = building.rooms.find((r) => r.name === quick.dataset.quick);
    if (room) chooseRoom(room);
  }
  const floor = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-floor]');
  if (floor) setFloor(Number(floor.dataset.floor));
});

function updateLocation() {
  const node = building?.nodes.find((n) => n.id === origin);
  $('#location-label').textContent = sample
    ? 'Sample starting point'
    : node
      ? 'Last confirmed location'
      : 'Scan to locate yourself';
  $('#location-detail').textContent = node
    ? `${node.label}${sample ? ' · demo' : confirmedAt ? ' · ' + new Date(confirmedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
    : 'Your position updates at QR checkpoints.';
  if (node) viewer?.locate(node.position, node.floor);
  renderRoutePreview();
}

function renderRoutePreview() {
  const preview = $('#route-preview');
  const destination =
    building?.rooms.find((room) => room.category === 'food') ?? building?.rooms[0];
  if (!building || !destination) {
    preview.hidden = true;
    return;
  }
  const start = building.nodes.find((node) => node.id === origin);
  const suggested = start
    ? route(building, start.id, destination.node, { accessible, blocked })
    : null;
  const floorIds = [...new Set(suggested?.nodes.map((node) => node.floor))];
  const floors = floorIds
    .map((id) => building!.floors.find((floor) => floor.id === id)?.name)
    .filter(Boolean)
    .join(' → ');
  preview.hidden = false;
  preview.innerHTML = `<div class="route-preview-copy"><span class="eyebrow">${sample ? 'DEMO ROUTE' : 'ROUTE PREVIEW'}</span><h3>${start ? esc(start.label) + ' → ' : ''}${esc(destination.name)}</h3><p>${suggested ? `${esc(floors)} · ~${Math.max(1, Math.ceil(suggested.distance / 80))} min walk · ${Math.round(suggested.distance)} m approx.` : start ? 'No permitted route from this starting point.' : 'Scan a checkpoint to set your starting point.'}</p></div><button id="preview-route">${suggested ? 'View route' : start ? 'View place' : 'Scan to start'}${icon('chevron-right')}</button>`;
  $('#preview-route').onclick = () => {
    chooseRoom(destination);
    if (suggested || !start) startRoute(false);
  };
  refreshIcons();
}
async function activate(pkg: StoredPackage, archive?: Uint8Array) {
  searchSequence++;
  currentPackage = pkg;
  currentArchive = archive;
  building = pkg.building;
  chat.reset();
  embeddings = JSON.parse(strFromU8(pkg.files['embeddings.json'])).vectors;
  warmUp();
  origin = sample ? 'entrance' : undefined;
  confirmedAt = undefined;
  selected = undefined;
  floorTarget = undefined;
  nodeTarget = undefined;
  routeStart = undefined;
  blocked.clear();
  path = null;
  emergency = false;
  currentFloor = 0;
  accessible = false;
  $('#search-card').hidden = false;
  $('#search-results').hidden = true;
  $('#search-results').replaceChildren();
  $<HTMLInputElement>('#destination-input').value = '';
  $('#route-card').hidden = true;
  $('#selection-card').hidden = true;
  viewer?.setRoute(null);
  $('#building-name').textContent = building.name;
  $('#header-building').textContent = building.name;
  $('#building-subtitle').textContent =
    `${building.provenance?.layoutStatus ?? 'Fictional building'} · ${building.floors.length} ${building.floors.length === 1 ? 'floor' : 'floors'}`;
  $('.map-heading .eyebrow').textContent = building.name.toUpperCase();
  $('#map-attribution').hidden = building.id !== 'robinsons-manila';
  $('#receive-hint').hidden = true;
  $('#map-subtitle').textContent = 'Choose a floor. Tap a destination to explore.';
  const quickRooms = ['food', 'facilities', 'services']
    .map((category) => building!.rooms.find((room) => room.category === category))
    .filter((room): room is Room => !!room);
  $('.quick-destinations').innerHTML =
    quickRooms
      .map(
        (room) =>
          `<button data-room="${esc(room.id)}">${icon(room.category === 'food' ? 'coffee' : room.category === 'facilities' ? 'accessibility' : 'map-pin')}${esc(room.name)}</button>`,
      )
      .join('') + `<button id="all-rooms">Directory${icon('arrow-right')}</button>`;
  $('#all-rooms').onclick = directoryModal;
  refreshIcons();
  const floors = $('.floor-control');
  floorWheel?.dispose();
  floors.innerHTML =
    '<span id="floor-wheel-label">FLOOR</span><div class="floor-wheel"><div class="floor-buttons" role="listbox" tabindex="0" aria-labelledby="floor-wheel-label" aria-label="Floor. Scroll or use arrow keys to select.">' +
    [...building.floors]
      .reverse()
      .map(
        (f) =>
          `<button id="floor-option-${f.id}" role="option" tabindex="-1" data-floor="${f.id}" aria-label="${esc(f.name)}" aria-selected="false">${f.id === 0 ? 'G' : String(f.id + 1).padStart(2, '0')}</button>`,
      )
      .join('') +
    '</div></div>';
  floorWheel = new FloorWheel($('.floor-buttons'), (floor) => setFloor(floor, true, false));
  try {
    if (!viewer) {
      $('#viewer').replaceChildren();
      const { BuildingViewer } = await import('./viewer');
      viewer = new BuildingViewer(
        $('#viewer'),
        $('#labels'),
        updateMode,
        chooseRoom,
        setFloor,
        (node) => goToNode(node.id),
      );
    }
    await viewer.load(building, pkg.files['building.glb']);
  } catch {
    showFallback();
    toast('3D could not load. Use the room directory and written directions.');
  }
  setFloor(0, false);
  if (building.floors.length === 1) setFloor(0);
  updateLocation();
  $('#map-loading').hidden = true;
}

function startRoute(evacuate: boolean) {
  if (!building) return;
  const from = evacuate ? origin : (routeStart?.id ?? origin);
  if (!from) {
    toast('Scan a checkpoint to confirm your starting location.');
    void scan();
    return;
  }
  emergency = evacuate;
  path = evacuate
    ? evacuationRoute(building, from, accessible, blocked)
    : nodeTarget
      ? route(building, from, nodeTarget.id, { accessible, blocked })
      : floorTarget !== undefined
        ? routeToFloor(building, from, floorTarget, { accessible, blocked })
        : selected
          ? route(building, from, selected.node, { accessible, blocked })
          : null;
  $('#selection-card').hidden = true;
  $('#search-card').hidden = true;
  $('#route-card').hidden = false;
  viewer?.setRoute(path, emergency);
  if (!path) {
    $('#route-card').innerHTML =
      `<div class="route-header"><h3>No permitted route available</h3><button id="end-route" class="icon-button" aria-label="Close route">${icon('x')}</button></div><p>${esc(emergency ? building.instructions.assistance : 'Try another destination or review connections you marked blocked.')}</p><button id="reset-blocked" class="secondary-button">Clear session block reports</button>`;
    $('#reset-blocked').onclick = () => {
      blocked.clear();
      startRoute(emergency);
    };
  } else {
    const dest = path.nodes.at(-1)!;
    const steps = routeSteps(path);
    const targetFloor = building.floors.find((floor) => floor.id === floorTarget);
    const title = nodeTarget
      ? nodeTarget.label
      : targetFloor
        ? `${targetFloor.name} · ${dest.label}`
        : dest.label;
    $('#route-card').innerHTML =
      `<div class="route-header"><span class="route-symbol ${emergency ? 'evacuation' : ''}">${icon(emergency ? 'door-open' : 'navigation')}</span><div><span class="eyebrow">${emergency ? 'EVACUATION DEMO' : routeStart ? 'ROUTE FROM ' + esc(routeStart.label.toUpperCase()) : 'YOUR DEMO ROUTE'}</span><h3>${esc(title)}</h3></div><button id="end-route" class="icon-button" aria-label="End route">${icon('x')}</button></div><div class="route-meta"><span>${Math.round(path.distance)} m approximate distance</span><label><input type="checkbox" id="accessible-toggle" ${accessible ? 'checked' : ''}/> Step-free</label></div><button id="toggle-directions" class="text-button" aria-controls="route-steps" aria-expanded="false">Show directions</button><div class="route-steps" id="route-steps" hidden>${steps.map((step, i) => `<div class="route-step"><span>${i + 1}</span><p>${esc(step.text)}</p><button data-block="${esc(step.edges.join(','))}" aria-label="Report connection ${i + 1} blocked">${icon('ban')}</button></div>`).join('')}</div><div class="route-footnote">${icon(emergency ? 'triangle-alert' : 'scan-line')}<span>${esc(emergency ? building.instructions.emergency : 'Scan the next checkpoint to update your position. This marker does not track your movement.')}</span></div>`;
    $('#toggle-directions').onclick = () => {
      const steps = $('#route-steps');
      steps.hidden = !steps.hidden;
      $('#toggle-directions').setAttribute('aria-expanded', String(!steps.hidden));
      $('#toggle-directions').textContent = steps.hidden ? 'Show directions' : 'Hide directions';
    };
    $('#accessible-toggle').onchange = (e) => {
      accessible = (e.target as HTMLInputElement).checked;
      startRoute(emergency);
    };
    $('#route-card')
      .querySelectorAll<HTMLButtonElement>('[data-block]')
      .forEach((b) => {
        b.onclick = () => {
          if (b.dataset.block) {
            for (const id of b.dataset.block.split(',')) blocked.add(id);
            startRoute(emergency);
            toast('Connection marked blocked for this session only.');
          }
        };
      });
    setFloor(path.nodes[0].floor);
  }
  $('#end-route').onclick = () => {
    path = null;
    floorTarget = undefined;
    nodeTarget = undefined;
    routeStart = undefined;
    emergency = false;
    viewer?.setRoute(null);
    $('#route-card').hidden = true;
    $('#search-card').hidden = false;
    renderRoutePreview();
  };
  refreshIcons();
}
function evacuation() {
  if (!building) {
    toast('Load a building package first.');
    return;
  }
  modal(
    'Evacuation guidance',
    `<div class="warning-box">${icon('triangle-alert')}<p>${esc(building.instructions.emergency)}</p></div><p>Start from the demo position or a scanned checkpoint. Elevators are excluded. These illustrative routes are not real evacuation instructions.</p><label class="toggle-row"><input type="checkbox" id="evac-accessible" ${accessible ? 'checked' : ''}/> I need a step-free route</label><button class="primary-button" id="confirm-evac">${icon('door-open')}Show demo exit route</button>`,
  );
  $('#confirm-evac').onclick = () => {
    accessible = $<HTMLInputElement>('#evac-accessible').checked;
    closeModal();
    startRoute(true);
  };
}

async function handleCheckpoint(text: string) {
  const checkpoint = parseCheckpoint(text);
  if (!supportedBuildingIds.includes(checkpoint.building))
    throw new Error('This installation does not trust that building.');
  if (!building || building.id !== checkpoint.building) {
    try {
      await loadBuilding(checkpoint.building);
    } catch (error) {
      if (isNative() && checkpoint.building === 'demo-001') await downloadNative(checkpoint);
      else throw error;
    }
  }
  const node = building!.nodes.find((n) => n.checkpoint === checkpoint.checkpoint);
  if (!node) throw new Error('This checkpoint is not in the saved building version.');
  origin = node.id;
  confirmedAt = new Date().toISOString();
  sample = false;
  updateLocation();
  setFloor(node.floor);
  if (path) startRoute(emergency);
  closeModal();
  toast('Location confirmed: ' + node.label);
}
async function downloadNative(checkpoint: Checkpoint) {
  modal(
    'Receive this building',
    `<div class="setup-illustration">${icon('wifi')}</div><p>The app will request permission to join <strong>${esc(checkpoint.wifi?.ssid ?? 'Building-Maps')}</strong>, then receive the building directly from its on-site computer. Internet is not required.</p><p class="muted" id="transfer-status">Waiting for the phone’s connection prompt…</p>`,
  );
  const result = await nativeRequest<{ archive: string }>('download', { checkpoint }, 120000);
  $('#transfer-status').textContent = 'Checking the publisher signature and building files…';
  const archive = fromBase64(result.archive);
  const pkg = verifyPackage(archive, trust.key, checkpoint.building);
  await nativeRequest('savePackage', { buildingId: checkpoint.building, archive: result.archive });
  sample = false;
  await activate(pkg, archive);
}
async function scan() {
  if (isNative()) {
    try {
      const text = await nativeRequest<string>('scan', {}, 120000);
      await handleCheckpoint(text);
    } catch (e) {
      toast((e as Error).message);
    }
    return;
  }
  modal(
    'Scan a checkpoint',
    `<p>Point your camera at a Waypoint checkpoint. In this preview, you can also select a sample checkpoint below.</p><video id="scan-video" playsinline muted></video><p id="scan-status" class="muted">Requesting camera access…</p><label class="field-label" for="demo-checkpoint">SAMPLE CHECKPOINT</label><select id="demo-checkpoint">${(
      building?.nodes ?? []
    )
      .filter((n) => n.checkpoint)
      .map((n) => `<option value="${esc(n.checkpoint!)}">${esc(n.label)}</option>`)
      .join(
        '',
      )}</select><button id="sample-scan" class="secondary-button">Use sample checkpoint</button>`,
  );
  $('#sample-scan').onclick = () => {
    if (building)
      handleCheckpoint(
        JSON.stringify({
          v: 1,
          building: building.id,
          checkpoint: $<HTMLSelectElement>('#demo-checkpoint').value,
        }),
      ).catch((e) => toast(e.message));
  };
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    if ($('#modal').hidden) {
      cameraStream.getTracks().forEach((t) => t.stop());
      return;
    }
    const { default: jsQR } = await import('jsqr');
    if ($('#modal').hidden) {
      cameraStream.getTracks().forEach((track) => track.stop());
      return;
    }
    const video = $<HTMLVideoElement>('#scan-video');
    video.srcObject = cameraStream;
    await video.play();
    $('#scan-status').textContent = 'Keep the checkpoint inside the camera view.';
    scanRunning = true;
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      if (!scanRunning) return;
      if (video.readyState >= 2) {
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = (video.videoHeight * canvas.width) / video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height);
        if (code) {
          scanRunning = false;
          void handleCheckpoint(code.data).catch((e) => {
            $('#scan-status').textContent = e.message;
          });
          return;
        }
      }
      scanningFrame = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    if (!$('#modal').hidden) {
      $('#scan-video').hidden = true;
      $('#scan-status').textContent =
        'Camera unavailable. Use a sample checkpoint to try the interaction.';
    }
  }
}

$('#search-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!building) {
    toast('Receive a building package first.');
    return;
  }
  const typed = $<HTMLInputElement>('#destination-input').value.trim();
  if (!typed) return;
  // Filipino and Taglish are understood through a word-level translation.
  const query = localizeMessage(typed).text;
  const sequence = ++searchSequence;
  const results = $('#search-results');
  results.hidden = false;
  // Guardrails before any model: switch buildings on request, decline off-topic questions.
  // "create a route going to X": when X is not a known floor, place, or landing, the request
  // behaves exactly like typing X on its own, so every guard and the search still apply to it.
  const routeRequest = matchRouteRequest(query);
  const destination = routeRequest && resolveEndpoint(routeRequest.to, building, currentFloor);
  const effectiveQuery =
    routeRequest && !routeRequest.from && !destination ? routeRequest.to : query;
  const guard = classifyQuery(effectiveQuery, building.id, building.floors, currentFloor);
  if (guard.kind === 'floor') {
    const target = guard.request.floor;
    if (!target) {
      results.innerHTML = `<p class="search-status">${esc(building.name)} has no ${esc(guard.request.requested)}. Its floors are ${esc(building.floors.map((floor) => floor.name).join(', '))}.</p>`;
      return;
    }
    results.innerHTML = `<p class="search-status">Planning a route to ${esc(target.name)}…</p>`;
    $<HTMLInputElement>('#destination-input').value = '';
    goToFloor(target.id);
    return;
  }
  if (guard.kind === 'connection') {
    results.innerHTML = `<p class="search-status">Routing to the nearest ${esc(guard.request.requested)}…${guard.request.requested === 'escalator' ? ' This demo maps escalators as stairs connections.' : ''}</p>`;
    $<HTMLInputElement>('#destination-input').value = '';
    goToConnection(guard.request.kind, guard.request.requested);
    return;
  }
  if (guard.kind === 'building') {
    results.innerHTML = `<p class="search-status">${esc(guard.current ? `You are already viewing ${guard.name}.` : `Switching to ${guard.name}…`)}</p>`;
    if (!guard.current) {
      $<HTMLInputElement>('#destination-input').value = '';
      await switchDemo(guard.id);
    }
    return;
  }
  // "Route from the first floor to the second floor": explicit endpoints.
  if (routeRequest?.from && !destination) {
    results.innerHTML = `<p class="search-status">I do not know a place or floor called “${esc(routeRequest.to)}” in ${esc(building.name)}. Try a floor name or a place from the directory.</p>`;
    return;
  }
  if (routeRequest && destination) {
    const startEndpoint = routeRequest.from
      ? resolveEndpoint(routeRequest.from, building, currentFloor)
      : undefined;
    if (routeRequest.from && !startEndpoint) {
      results.innerHTML = `<p class="search-status">I do not know a place or floor called “${esc(routeRequest.from)}” in ${esc(building.name)}. Try a floor name or a place from the directory.</p>`;
      return;
    }
    if (!startEndpoint && !origin) {
      toast('Scan a checkpoint to confirm your starting location.');
      void scan();
      return;
    }
    // "step-free route to the cinema": the preference applies to this route.
    const routePreference = explicitRoutePreferences(query);
    if (routePreference.stepFree !== 'keep') accessible = routePreference.stepFree === 'yes';
    const endpointOf = (endpoint: ResolvedEndpoint) =>
      endpoint.kind === 'floor'
        ? { floor: endpoint.floor.id }
        : endpoint.kind === 'connection'
          ? { connection: endpoint.connection }
          : { node: endpoint.node };
    const found = routeBetween(
      building,
      startEndpoint ? endpointOf(startEndpoint) : { node: origin },
      endpointOf(destination),
      { accessible, blocked },
    );
    const fromLabel = startEndpoint
      ? startEndpoint.kind === 'floor'
        ? startEndpoint.floor.name
        : startEndpoint.label
      : 'your position';
    const toLabel = destination.kind === 'floor' ? destination.floor.name : destination.label;
    if (!found) {
      results.innerHTML = `<p class="search-status">There is no permitted${accessible ? ' step-free' : ''} route from ${esc(fromLabel)} to ${esc(toLabel)}.</p>`;
      return;
    }
    $<HTMLInputElement>('#destination-input').value = '';
    if (startEndpoint)
      planRoute(found.nodes[0].id, found.nodes.at(-1)!.id, `${fromLabel} → ${toLabel}`);
    else if (destination.kind === 'floor') goToFloor(destination.floor.id);
    else if (destination.kind === 'connection')
      goToConnection(destination.connection, destination.label);
    else if (destination.room) {
      chooseRoom(destination.room);
      startRoute(false);
    } else goToNode(destination.node);
    return;
  }
  // Factual questions about the building are answered from the package, not searched.
  const asked = matchBuildingQuestion(effectiveQuery);
  const fact =
    asked && answerBuildingQuestion(asked, building, { origin, currentFloor, accessible, blocked });
  if (fact && !fact.fallbackQuery) {
    results.innerHTML =
      `<p class="search-status">${esc(fact.text)}</p>` +
      fact.rooms
        .map(
          (room) =>
            `<button class="search-result" data-room="${esc(room.id)}"><span>${esc(room.name)}<small>${esc(building!.floors[room.floor].name)}</small></span>${icon('arrow-up-right')}</button>`,
        )
        .join('');
    refreshIcons();
    if (fact.scan) void scan();
    return;
  }
  if (guard.kind === 'exit') {
    const door = entranceNode(building);
    if (!door) {
      results.innerHTML = `<p class="search-status">${esc(building.name)} has no mapped entrance in this demo.</p>`;
      return;
    }
    if (origin === door.id) {
      results.innerHTML = `<p class="search-status">You are already at ${esc(door.label)}. Tell me where to go next.</p>`;
      return;
    }
    results.innerHTML = `<p class="search-status">Routing to ${esc(door.label)}…</p>`;
    $<HTMLInputElement>('#destination-input').value = '';
    goToNode(door.id);
    return;
  }
  if (guard.kind === 'offtopic') {
    results.innerHTML = `<p class="search-status">${esc(offTopicReply(guard.reason, building.name))}</p>`;
    return;
  }
  // "I don't want to use stairs, supermarket": apply the routing preference, search the rest.
  const askedText = fact?.fallbackQuery ?? effectiveQuery;
  const preference = explicitRoutePreferences(askedText);
  const term = preference.stepFree === 'keep' ? askedText : stripRoutePreferences(askedText);
  let preferenceNote = '';
  if (preference.stepFree !== 'keep') {
    const stepFree = preference.stepFree === 'yes';
    preferenceNote = stepFree
      ? 'Step-free route on: elevators instead of stairs.'
      : 'Stairs are allowed on routes again.';
    if (accessible !== stepFree) {
      accessible = stepFree;
      // With no new destination, re-plan the route already on screen.
      if (path && !term) startRoute(emergency);
    }
    if (!term) {
      results.innerHTML = `<p class="search-status">${esc(preferenceNote)} ${path && selected ? `Your route to ${esc(selected.name)} is updated.` : 'Where would you like to go?'}</p>`;
      return;
    }
  }
  results.innerHTML =
    '<div class="search-status"><span class="loader small"></span>Searching on your device…</div>';
  // "restroom on floor 7": the floor limits the candidates.
  const qualifier = splitFloorQualifier(term, building.floors, currentFloor);
  const searchTerm = qualifier.text;
  const exact = building.rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.aliases.some((a) => a.toLowerCase() === searchTerm.toLowerCase()),
  );
  try {
    let ranked = exact.length
      ? exact.map((room) => ({ room, score: 1 }))
      : relevantMatches(
          await semanticSearch(searchTerm, building.rooms, embeddings, building.rooms.length),
        );
    if (sequence !== searchSequence) return;
    let floorNote = '';
    if (qualifier.floor) {
      const onFloor = ranked.filter(({ room }) => room.floor === qualifier.floor!.id);
      if (onFloor.length) ranked = onFloor;
      else if (ranked.length)
        floorNote = `Nothing matching is mapped on ${qualifier.floor.name}; these are the closest elsewhere.`;
    }
    const seen = new Set<string>();
    const matches = ranked
      .filter(({ room }) => !seen.has(room.name) && !!seen.add(room.name))
      .slice(0, 3);
    if (!matches.length) {
      const need = expandNeed(searchTerm);
      results.innerHTML = `<p class="search-status">${preferenceNote ? esc(preferenceNote) + ' ' : ''}${need.facility ? `${esc(building.name)} has no mapped ${esc(need.label ?? 'such place')} in this demo map. Staff at an information desk may help.` : `No place in ${esc(building.name)} matches “${esc(searchTerm)}”. Try a store or service name, or open the directory.`}</p>`;
      return;
    }
    if (floorNote) preferenceNote = `${preferenceNote} ${floorNote}`.trim();
    results.innerHTML =
      (preferenceNote ? `<p class="search-status">${esc(preferenceNote)}</p>` : '') +
      `<span class="result-caption">${exact.length ? 'DIRECTORY MATCHES' : matches[0].score >= 0.35 ? 'LOCAL AI SUGGESTIONS · CHOOSE A DESTINATION' : 'CLOSEST MATCHES · CHECK THE NAME BEFORE YOU GO'}</span>` +
      matches
        .map(
          ({ room }) =>
            `<button class="search-result" data-room="${esc(room.id)}"><span>${esc(room.name)}<small>${esc(building!.floors[room.floor].name)}</small></span>${icon('arrow-up-right')}</button>`,
        )
        .join('');
    refreshIcons();
  } catch {
    if (sequence !== searchSequence) return;
    const matches = building.rooms.filter((r) =>
      (r.name + ' ' + r.aliases.join(' ')).toLowerCase().includes(term.toLowerCase()),
    );
    results.innerHTML =
      '<p class="search-status">Local AI is unavailable. You can still browse and search room names.</p>' +
      matches
        .slice(0, 3)
        .map(
          (room) =>
            `<button class="search-result" data-room="${esc(room.id)}">${esc(room.name)}</button>`,
        )
        .join('');
  }
};

function directoryModal() {
  if (!building) return;
  modal(
    'Room directory',
    building.floors
      .map(
        (f) =>
          `<h3 class="floor-heading">${esc(f.name)}</h3>${building!.rooms
            .filter((r) => r.floor === f.id)
            .map(
              (r) =>
                `<button class="directory-room" data-room="${esc(r.id)}"><span>${esc(r.name)}</span>${icon('arrow-up-right')}</button>`,
            )
            .join('')}`,
      )
      .join(''),
  );
  $('#modal-body')
    .querySelectorAll('[data-room]')
    .forEach((b) => b.addEventListener('click', closeModal));
}
function buildingModal() {
  modal(
    'Choose your demo',
    `<p>Choose a mall or tower. All ${demos.length} maps and local AI are bundled in the installed app.</p><div class="demo-grid">${demos.map((demo) => `<button class="demo-option ${demo.kind}" data-demo="${esc(demo.id)}" ${switchingBuilding ? 'disabled' : ''}><span class="demo-model ${demo.id}" aria-hidden="true">${icon(demo.kind === 'tower' ? 'building' : 'store')}</span><span class="demo-option-copy"><strong>${esc(demo.name)}</strong><span>${demo.floors} ${demo.floors === 1 ? 'floor' : 'floors'} · ${esc(demo.layoutStatus)}</span><small>${esc(demo.summary)}</small></span>${icon(building?.id === demo.id ? 'circle-check' : 'arrow-up-right')}</button>`).join('')}</div><p class="muted">Estancia follows published store outlines. Robinsons combines a referenced envelope with an interpreted interior plan. Estimated details are listed in each package.</p>`,
  );
  $('#modal-body')
    .querySelectorAll<HTMLButtonElement>('[data-demo]')
    .forEach((button) => {
      button.onclick = () => void switchDemo(button.dataset.demo!);
    });
}
/** Switch to another bundled demo building from the picker, the search box, or the chat. */
async function switchDemo(id: string) {
  if (switchingBuilding || building?.id === id) return;
  switchingBuilding = true;
  if (!$('#modal').hidden) closeModal();
  $('#map-loading').hidden = false;
  try {
    await loadBuilding(id);
  } catch (error) {
    toast((error as Error).message);
  } finally {
    switchingBuilding = false;
    $('#map-loading').hidden = true;
  }
}
async function loadBuilding(id: string) {
  if (!supportedBuildingIds.includes(id)) throw new Error('Unknown building.');
  let pkg: StoredPackage;
  let bytes: Uint8Array | undefined;
  if (isNative()) {
    const result = await nativeRequest<{ archive?: string }>('loadPackage', { buildingId: id });
    if (!result.archive) throw new Error('The building package is not saved or bundled.');
    bytes = fromBase64(result.archive);
    pkg = verifyPackage(bytes, trust.key, id);
    await nativeRequest('savePackage', { buildingId: id, archive: result.archive });
  } else {
    const cached = await loadPackage(id);
    if (cached) {
      try {
        const expected = await fetch(demoPackagePath(id));
        if (!expected.ok) throw new Error('Bundled package unavailable.');
        bytes = new Uint8Array(await expected.arrayBuffer());
        pkg = verifyPackage(bytes, trust.key, id);
      } catch {
        bytes = zipSync(cached.files);
        pkg = verifyPackage(bytes, trust.key, id);
      }
    } else {
      const response = await fetch(demoPackagePath(id));
      if (!response.ok) throw new Error('Demo package is unavailable. Run npm run setup.');
      bytes = new Uint8Array(await response.arrayBuffer());
      pkg = verifyPackage(bytes, trust.key, id);
    }
    await savePackage(pkg);
  }
  sample = true;
  await activate(pkg, bytes);
  try {
    localStorage.setItem('waypoint-demo', id);
  } catch {
    /* Device storage can be unavailable. */
  }
}
function packageModal() {
  modal(
    'Offline buildings',
    `<div class="package-status">${icon('shield-check')}<div><strong>${currentPackage ? esc(currentPackage.building.name) : 'No building selected'}</strong><p>${currentPackage ? 'Version ' + esc(currentPackage.manifest.version) + ' · ' + (currentArchive ? (currentArchive.byteLength / 1024 / 1024).toFixed(1) + ' MB' : 'Files saved') : 'Choose a bundled demo to begin.'}</p></div></div><p>All demo maps are included in the installed app. Local Wi-Fi is used only to receive updated packages from the on-site computer.</p><div class="package-actions"><button id="choose-offline-demo" class="secondary-button">${icon('building-2')}Choose demo building</button><button id="receive-package" class="primary-button">${icon('scan-line')}Scan entrance QR</button>${!isNative() ? '<button id="download-local" class="secondary-button">Receive from local demo server</button><label class="secondary-button import-label">Import signed package<input id="import-package" type="file" accept=".zip" hidden/></label>' : ''}${currentPackage ? '<button id="delete-package" class="text-button danger">Remove saved copy</button>' : ''}</div><p id="package-message" class="muted"></p>`,
  );
  $('#choose-offline-demo').onclick = buildingModal;
  $('#receive-package').onclick = () => {
    closeModal();
    void scan();
  };
  $('#download-local')?.addEventListener('click', async () => {
    try {
      $('#package-message').textContent = 'Receiving from the local computer…';
      const id = building?.id ?? defaultBuildingId;
      const response = await fetch(`/local/buildings/${id}/manifest`);
      if (!response.ok) throw new Error('Start the local package server with npm run server.');
      const manifest = await response.json();
      const file = await fetch(
        `/local/buildings/${id}/packages/${encodeURIComponent(manifest.version)}.zip`,
      );
      if (!file.ok) throw new Error('Building download failed.');
      await installArchive(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      $('#package-message').textContent = (e as Error).message;
    }
  });
  $('#import-package')?.addEventListener('change', async (e) => {
    try {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) throw new Error('Package exceeds 50 MB.');
      await installArchive(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      $('#package-message').textContent = (e as Error).message;
    }
  });
  $('#delete-package')?.addEventListener('click', async () => {
    const id = building!.id;
    if (isNative()) await nativeRequest('removePackage', { buildingId: id });
    else await removePackage(id);
    currentPackage = undefined;
    currentArchive = undefined;
    building = undefined;
    chat.reset();
    origin = undefined;
    embeddings = {};
    viewer?.dispose();
    $('#viewer').replaceChildren();
    $('#labels').replaceChildren();
    viewer = undefined;
    $('#receive-hint').hidden = true;
    $('#directory-list').replaceChildren();
    $('#route-card').hidden = true;
    $('#selection-card').hidden = true;
    $('#search-card').hidden = false;
    $('#map-loading').hidden = true;
    updateLocation();
    closeModal();
    toast('Saved copy removed. Choose a demo to open its bundled package again.');
  });
}
async function installArchive(archive: Uint8Array) {
  const pkg = verifyPackage(archive, trust.key, supportedBuildingIds);
  if (isNative())
    await nativeRequest('savePackage', { buildingId: pkg.building.id, archive: toBase64(archive) });
  else await savePackage(pkg);
  sample = false;
  await activate(pkg, archive);
  closeModal();
  toast('Verified building saved for offline use. Scan a checkpoint to locate yourself.');
}

$('#receive-first').onclick = () => void scan();
$('#building-picker').onclick = buildingModal;
$('#demos-tab').onclick = buildingModal;
$('#scan-top').onclick = () => void scan();
$('#locate-button').onclick = () => {
  const node = building?.nodes.find((n) => n.id === origin);
  if (node) setFloor(node.floor);
  else void scan();
};
$('#zoom-in').onclick = () => viewer?.zoom(0.78);
$('#zoom-out').onclick = () => viewer?.zoom(1.28);
function showBuilding(exploded = false) {
  selected = undefined;
  $('#selection-card').hidden = true;
  if ($('#route-card').hidden) $('#search-card').hidden = false;
  viewer?.overview(exploded);
  renderRoutePreview();
}
$('#overview').onclick = () => showBuilding();
$('#explode-view').onclick = () => showBuilding(!viewer?.isExploded);
$('#flat-view').onclick = () => viewer?.toggleFlat();
$('#directory-tab').onclick = directoryModal;
$('#package-tab').onclick = packageModal;
$('#explore-tab').onclick = () => showBuilding();
$('#evacuate-side').onclick = evacuation;
$('#help-tab').onclick = () =>
  modal(
    'A building in your pocket',
    `<div class="help-steps"><p><strong>01 · Pick your building</strong>Choose Demos to explore Robinsons Manila, the detailed Estancia ground floor, or twenty-floor Waypoint Tower.</p><p><strong>02 · Find your floor</strong>Drag to orbit; pinch to zoom and pan. Zoom keeps the whole building intact. Tap a floor or select it with the floor buttons to reveal its interior. Scroll the floor buttons to reach upper floors. Tap a destination for details.</p><p><strong>03 · Find your way</strong>Try a route from the demo entrance, or scan a checkpoint. Search naturally and choose a local AI suggestion.</p><p><strong>04 · Keep going offline</strong>The installed app bundles every demo map and AI. Local Wi-Fi is needed only to receive updates.</p>${building?.provenance ? `<p><strong>About this model · ${esc(building.provenance.layoutStatus)}</strong>${esc(building.provenance.layoutNote)}</p>` : ''}</div>`,
  );

async function init() {
  if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      // Let the worker cache the first chosen model/chunks too, not only later visits.
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener('controllerchange', finish);
            resolve();
          };
          const timeout = setTimeout(finish, 4000);
          navigator.serviceWorker.addEventListener('controllerchange', finish);
          if (navigator.serviceWorker.controller) finish();
        });
    } catch {
      /* Storage restrictions should not prevent the browser preview from opening. */
    }
  }
  try {
    let id = defaultBuildingId;
    try {
      const previous = localStorage.getItem('waypoint-demo');
      if (previous && demos.some((demo) => demo.id === previous)) id = previous;
    } catch {
      /* Start with the default demo. */
    }
    await loadBuilding(id);
  } catch (e) {
    $('#map-loading').hidden = true;
    toast((e as Error).message);
  }
}
void init();
