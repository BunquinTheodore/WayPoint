# Model loading and rendering optimizations

SM City Marikina is retired from the selectable catalog, trusted demo IDs, generated mobile asset references, and production distribution. Its editable Blender/source exports are retained. Estancia Main Mall GF is the new default; a saved preference for the retired building falls back to Estancia.

## Loading

- Fetch and parse only the selected building's signed archive. The installed app retains the three bundled archives for first-launch offline use; Metro asset references do not instantiate their 3D scenes.
- Dynamically import the web 3D viewer when opening a building, the camera decoder when scanning, and semantic-search/ONNX code for a non-directory query. Import only the Lucide icons the interface uses.
- Initialize native AI on the first semantic query, instead of warming it concurrently with the initial model.
- Precache only HTML and the entry script/styles. Cache selected packages, lazy chunks, and used AI assets on demand. Wait briefly for initial service-worker control so the first opened building and viewer chunk are cached too. Match same-origin static cache responses despite the preview server's `Vary: Origin` header. Cache quota failures do not block loading.
- Strip retired demos and duplicate raw exports from the generated production distribution. Purge obsolete generated mobile demo ZIPs.

## Rendering

Batch compatible static meshes by floor, material, and detail-fade behavior. Bake transforms, including mirrored triangle winding; preserve separate floor groups, slab hover outlines, geometry bounds, and room/route coordinates. Model triangles remain unchanged.

| Building              | Original static meshes | Batched static meshes | Reduction |
| --------------------- | ---------------------: | --------------------: | --------: |
| Estancia Main Mall GF |                    865 |                    61 |     92.9% |
| Robinsons Manila      |                    983 |                   241 |     75.5% |
| Waypoint Tower        |                  3,832 |                   988 |     74.2% |

Use a capped pixel ratio (1.25 for coarse-pointer devices, 1.5 otherwise), 1024px shadow maps updated when layout/visibility changes, and no detail-prop shadow casting. Render at up to 60fps while interacting or moving the camera, and up to 30fps while fades settle; stop drawing unchanged scenes and skip hidden-tab rendering. Controls, hover, model/route changes, viewport changes, and reduced-motion changes request fresh frames. Reuse the reduced-motion media query. Switching/removing a model releases its shared geometry, material, and texture resources. Stale asynchronous model loads cannot replace a newer choice or recreate a disposed viewer.

The initial web entry script is approximately 111 KB uncompressed, compared with the previous approximately 1.5 MB monolithic entry. The separately loaded viewer is still needed to display 3D; this entry-size comparison is not a total-download or measured frame-rate claim.

## Validation

- Actual-GLB tests verify mesh reduction, unchanged bounds, selectable floor groups, independent detail fades, mirrored transforms, and shared-resource disposal.
- Fresh production-browser request capture fetches only Estancia's package at startup, with no other building, camera decoder, or AI asset requests.
- First-visit offline reload and navigation pass. Exact directory search does not initialize AI. Semantic search loads AI only on request and works after an offline reload.
- Repeated tower/Estancia switches leave GPU buffer counts stable when returning to the same view; no accumulating building buffers were observed.
- Tower top-floor selection and desktop/tablet/phone layouts pass without browser errors.
- Generated mobile viewer replay with a simulated native package bridge works offline, requests only selected packages, lists three demos, and makes no startup inference call. This is a bundle/bridge check, not a physical-device frame-rate measurement.
- Production/mobile-viewer builds, root tests, Expo lint, mobile TypeScript, changed-file formatting, and whitespace checks pass.
