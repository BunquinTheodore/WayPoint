# Monochrome UI implementation

The shared web viewer and native startup/scanner shell use a black-and-white palette. Scene lighting, markers, and routes follow the same palette. Imported materials stay neutral except for a muted blue glass tint. Selected rooms receive a black outline and subtle floor fill using their polygon footprint when available, or their rectangular size otherwise.

Desktop navigation stays visible in a 260px sidebar above the 760px breakpoint. Phones use a drawer with a keyboard focus loop, Escape dismissal, and focus restoration. The top navbar has been removed; building context and checkpoint scanning appear directly over the map.

## Building and floor views

The default assembled overview shows the building's roof and exterior when those are available. The view control switches to an interior floor stack with clipped partitions and lighter surrounding floors. Floors stay at their original model heights with no added separation. Zooming keeps the whole building intact; selecting a floor opens its interior view. Towers show a window of floors around the selected level; Estancia remains a single documented floor.

Only display coordinates change. Room highlights, hit planes, labels, checkpoint markers, and route endpoints use presentation offsets, while routing retains original positions and distances. Compact store tags have collision filtering, with full names available through accessible labels and selection.

Mouse hover keeps the floor under the pointer opaque, adds a blue perimeter outline and subtle brightness boost, and fades floors above and below it to at most 4% opacity. Furniture and interior accessories on those other floors fade further to 1%. Detail metadata is inherited by every imported mesh part, and opaque materials refresh their shader when entering transparency so the fade is actually rendered. The roof also fades to expose the hovered level, and faded floors stop casting opaque shadows. Picking uses actual visible, unclipped model geometry in assembled and exploded views. Moving off the model or starting a camera gesture restores the normal opacity; releasing a mouse gesture resumes hover at the pointer. Hover alone does not change the selected floor or route. Clicking or tapping a floor in the building overview selects it and focuses its interior; selecting a different floor in the exploded view does the same. The room directory and floor selector update together, with the selector scrolling to the chosen level. Floor picking is shared by mouse and touch input. Dragging, canceled gestures, and multi-pointer gestures do not select a floor. Reduced-motion settings make the opacity change immediate.

Browser checks verified a middle level in the assembled tower, a middle floor in the exploded view, and restoration on pointer exit, with no browser errors. Previews: [Tower hover](previews/floor-hover-tower.png), [Exploded floor hover](previews/floor-hover-exploded.png).

Furniture refinement: verified the exploded tower’s middle floor with a blue hover perimeter and fully visible contents; furniture on the neighboring floors becomes barely visible. [Furniture hover fade](previews/furniture-hover-fade.png).

## Bottom panels

Search is anchored flush to the bottom edge as a full-width sheet. Its top handle and arrow button minimize it to a compact “Find a destination” bar and expand it again, retaining the search input and results. The toggle supports keyboard activation and exposes its expanded state. Active directions float over the map. The canvas fills the entire map area from top to bottom, behind the header and cards. Camera framing keeps the building between the header and cards while drawing the scene through the entire available screen. Labels are hidden beneath these overlays.

Selecting a destination replaces search with a full-width panel floating at the bottom of the map. Desktop places the starting location alongside the selected destination; phones stack the content. The renderer continues behind this panel; camera framing accounts for its height. Closing the selection restores search, and returning to the building overview dismisses the selection.

The search panel includes destination shortcuts and a suggested route. Route previews use graph distances and an estimated walking speed of 80m/min. Users without a confirmed origin are prompted to scan a checkpoint. Directions can expand from a compact route card.

Bottom sheet verification: desktop and 390×844 mobile views have a zero-pixel bottom gap. Minimizing reduces the sheet to 45px, and the map framing and controls adjust to the new height. Keyboard expansion restores the retained search text; no horizontal overflow on mobile. Previews: [Expanded sheet](previews/anchored-search-panel.png), [Minimized sheet on mobile](previews/collapsed-search-panel.png).

## Validation

- Production build and bundled mobile viewer generation passed.
- Test suite: 9 files, 66 tests passed.
- Mobile Expo lint and TypeScript checks passed.
- Browser checks covered desktop and phone layouts, including 1280×720 and 390×844 viewports.
- Verified assembled/exploded switching, floor selection, room highlights, reusable furniture, route creation, destination dismissal, and return to overview.
- Verified continuous canvas bounds behind search/directions, destination details floating over the full-screen map, compact tags, and no horizontal overflow.
- Earlier checks covered directory/demo dialogs, drawer keyboard focus, Escape restoration, reduced motion, and navigation with browser networking disabled after loading.

Current layout previews: [Map behind search](previews/map-behind-search-card.png), [Full-screen map with destination details](previews/full-screen-selected-map.png), [Map without top navbar](previews/map-without-top-navbar.png), [Restored building view](previews/restored-building-view.png).

Images in `docs/design` record the original concept and earlier implementation iterations, including the superseded floating destination card. They are not the final layout.

Native release builds with the 1.2.0 building packages passed earlier validation. The latest map layout was verified in the browser and rebuilt into the embedded viewer source; those existing native installer artifacts require a fresh native build to include the final layout. Physical-device camera scanning, local Wi-Fi transfer, and onscreen-keyboard behavior were not exercised. The production build continues to report the large JavaScript bundle warning.

Full-screen refinement: verified that map, viewer, and canvas bounds match from top to bottom with search and selected-destination panels, including a 390×844 phone viewport. No horizontal overflow; destination dismissal and controls remain functional.

Direct floor selection: browser checks opened Floor 15 by clicking its assembled façade and Floor 2 by clicking the middle exploded level. The corresponding directory and active floor controls updated. A model drag kept the original floor selected. Physical touch gestures were not exercised.

## Centered floor wheel

The floor control is centered beside the usable map area, with spacing above the bottom camera controls. Its scroll list snaps floors into a fixed center highlight. Scrolling or swiping automatically activates the centered floor and updates the model and directory; no button press is required. Top and bottom padding let the first and last floors occupy the center. Direct model selection also centers the corresponding wheel option.

The picker is a keyboard-accessible listbox with one selected option. Arrow keys move between floors; Home and End reach the top and ground levels. Compact layouts show one centered row. Resizing preserves the selected floor and recenters it.

Browser checks verified native scrolling, smaller scroll increments, first/last floor centering, keyboard selection, and exactly one selected option. The centered option had zero vertical offset from the list's midpoint at desktop, 390×844, and 390×500 sizes, with no control overlap or horizontal overflow. Preview: [Centered floor wheel](previews/centered-floor-wheel.png).
