# Waypoint UI revamp plan

## Direction

Replace the current sage-green and cream theme with a white, black, and neutral-gray interface inspired by https://bryllim.com/ and the supplied screenshots. Use its quiet sidebar, monospaced metadata, fine dividers, and subtle spatial grid as visual references, adapted to indoor navigation.

Remove the Waypoint symbol and wordmark from the proposed desktop and mobile interface for now. Use the active building name as orientation. The generated image is a design concept, not a screenshot of implemented changes. This deliverable does not modify the application.

The 3D map is the primary content. Search, floor selection, location confirmation, and directions must stay easy to reach. Retain the app's current offline semantic destination search and navigation behavior.

## Design system

| Token           | Value                             | Use                                                      |
| --------------- | --------------------------------- | -------------------------------------------------------- |
| Canvas          | #FFFFFF                           | App and panels                                           |
| Ink             | #111111                           | Main text, primary buttons, active controls              |
| Secondary text  | #666666                           | Supporting text                                          |
| Divider         | #E5E5E5                           | Decorative separators and panel boundaries               |
| Control outline | #767676                           | Unfilled controls where the boundary conveys interaction |
| Hover surface   | #F5F5F5                           | Navigation and rows                                      |
| Model surfaces  | #FAFAFA, #DEDEDE, #A3A3A3         | Architectural depth                                      |
| Focus           | 2px solid #111111 with 2px offset | Keyboard focus                                           |

Use a locally bundled sans serif for body text and headings, and a locally bundled monospace for floor numbers, breadcrumbs, shortcuts, and metadata. System font fallbacks remain available offline. Avoid the current serif map headline.

Use an 8px spacing scale with 4px refinements. Controls have restrained 6–10px corners; panels 10–12px. Use existing Lucide outline icons consistently. Shadows are subtle and limited to floating map labels or dialogs. Body text should meet 4.5:1 contrast; interactive outlines and focus indicators should meet applicable 3:1 contrast requirements. Decorative grid lines may be lighter.

## Desktop layout

- A 200–220px sidebar: active building selector, Explore, Directory, Offline buildings, Demos, and Help. Evacuation guide remains clearly reachable.
- A compact top bar: venue breadcrumb, package/readiness status, and Scan checkpoint.
- A large map viewport: small headline, view label, room labels, floor selector, and compact camera controls.
- A bottom search dock: destination input, send action, quick destinations derived from the active building, and search results.
- Route guidance and destination details use distinct panels. Only one primary bottom panel should dominate at a time.
- Keep the location chip visible and separate from search. Use “Demo starting point” for samples and “Last confirmed location” with a timestamp after scanning. Avoid implying continuous live positioning.

## Mobile layout

- Below 768px, replace the sidebar with a navigation drawer.
- Use a short header containing menu, venue name, and Scan checkpoint. Provide textual readiness status in the drawer or nearby status area.
- The map fills available space above a bottom sheet; account for device safe areas and the onscreen keyboard.
- Place floor and zoom controls at the right edge without overlapping room details or the sheet.
- Bottom sheet states: compact search, results, destination details, and active directions. Provide explicit expand/collapse controls alongside optional gestures.
- Use at least 44px touch targets. Hide secondary decoration before reducing map or control readability.
- Keep evacuation access available from the navigation drawer and a clearly labeled map action.

## 3D scene and route styling

Convert the scene background, grid, garden surfaces, building materials, starting marker, destination marker, and route materials to grayscale. Changing CSS alone will not recolor the Three.js scene.

Use grayscale value differences and architectural outlines to distinguish floors and rooms. Preserve the current floor clipping and visibility behavior. Ensure route markers remain legible against both bright slabs and dark outlines.

Use a black route with contrasting white backing where needed. Distinguish start and destination by shape and text: an outlined ring for the start, a filled pin for the destination. Label selected rooms and checkpoints directly.

A dashed route is a proposed visual treatment in the concept; implement it only if it remains readable with the existing route renderer. Shape, arrows, and labels are more important than matching the illustration exactly.

Evacuation mode uses an explicit “EVACUATION” heading, directional symbols, and a distinct line or pattern. It must remain distinguishable without relying on color.

The subtle dot grid supports the spatial view. Do not place dense decorative patterns behind search, directions, or critical labels.

## Screen and state inventory

1. Explore: whole building, floor view, room detail, and top-down view.
2. Directory: searchable list, categories, floor filters, empty results, and destination details.
3. Search: ready, processing, results, no match, unavailable AI, and retry/fallback. Retain text destination search when semantic inference is unavailable.
4. Directions: destination, origin, written steps, accessible-route option, cancel, blocked path, and no available route.
5. Offline buildings: installed packages, receive/import flow, validation progress, removal, errors, and readiness.
6. Demos: building selection and switching progress, with approximate/demo labels.
7. Scan checkpoint: camera permission, scanning, valid checkpoint, invalid code, denied permission, and close.
8. Help and notices: exploration instructions and approximate-layout details.
9. Evacuation: current starting-point context, available route, written guidance, blocked/no route, and exit from mode.
10. Shared states: loading, toast, dialog, 3D failure with floor-map fallback, and native/network errors.

“Offline ready” must reflect the actual map and inference readiness. A local map being loaded alone is insufficient evidence that AI is ready. Keep current sample-position and illustrative-layout disclosures.

## Implementation map

| File                                      | Planned work                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| src/style.css                             | Grayscale tokens, typography, sidebar/header, search dock, bottom sheet, dialogs, responsive layout, focus states               |
| src/main.ts                               | Remove desktop/mobile logo markup, restructure shell, concise labels, drawer/sheet state, consistent loading and readiness text |
| src/viewer.ts                             | Recolor Three.js background/materials/grid/routes/markers while retaining camera and navigation behavior                        |
| mobile/WaypointApp.tsx and mobile/App.tsx | Inspect native shell and safe-area/keyboard behavior; apply changes only where needed after reading mobile/AGENTS.md            |
| Existing navigation/search/package tests  | Run existing checks after implementation; add tests only for meaningful new state behavior                                      |

Preserve DOM IDs and event hooks where possible. Avoid introducing a new UI framework solely for this redesign.

## Build order

1. Introduce shared tokens and typography; remove both visual logos in the application when implementation begins.
2. Rebuild desktop and mobile shells, preserving controls and handlers.
3. Restyle the 3D scene and verify marker/route contrast.
4. Redesign search, destination, and directions panels.
5. Apply the same system to Directory, Offline buildings, Demos, scanning, Help, and evacuation.
6. Verify responsive behavior, touch/keyboard interaction, offline operation, and existing navigation/search/package checks.

## Acceptance criteria

- No Waypoint logo or wordmark in desktop or mobile UI.
- No green, orange, blue, or other chromatic colors in the redesigned interface or scene.
- The active floor, route, origin, destination, and offline status remain understandable through text and shape.
- Main screens work at 390px, 768px, and 1440px widths, including keyboard-open mobile search.
- Panels do not obscure essential map controls; dialogs remain keyboard accessible.
- Room selection, directions, scanning, building switching, and package management retain their existing behavior.
- The core search and navigation flow works with internet disconnected after required assets are installed.
- Demo/approximate layouts and checkpoint-based positions remain explicitly labeled.
- Optional motion respects reduced-motion settings.

## Image generation record

The concept uses the built-in image generation tool with the three supplied screenshots as references. The exact generation prompt is stored beside this plan as waypoint-ui-image-prompt.txt. The concept combines a desktop explorer and a mobile explorer; it is not a substitute for the remaining screen/state inventory above.

Saved concept: [Desktop and mobile monochrome UI](design/waypoint-monochrome-ui-concept.png). The architecture, tenant labels, and route measurements in the generated image are illustrative and must be replaced with the active building's actual data in implementation. Expanded floor spacing is a proposed presentation mode, not a claim about the current viewer.
