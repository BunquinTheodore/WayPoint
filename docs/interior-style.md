# Mall interior cutaway style

SM City Marikina and Estancia Main Mall GF now use the attached visual reference's open, monochrome interior direction. The editable Blender models contain low dividing walls with darker caps, storefront openings/posts, reusable CC0 furniture and food props, and paired escalator tread/rail symbols. The viewer keeps the selected floor opaque and other exploded floors lighter. The existing exploded/assembled view switch, orbit, pinch, room selection, and routing remain available.

Marikina contains four illustrative bays inside each of its six destination zones per level: 72 demo bays across three levels. Central aisles remain clear. The ground entrance zone has front and rear openings for its existing entrance route. These are generic demo subdivisions, not verified store identities or fit-outs.

Estancia preserves the official directory's irregular shop footprints, 25 store destinations, two restroom destinations, and single-floor scope. Its fixtures are illustrative. Escalator symbols remain inside the published zones and add no route connection or invented upper floor. The gallery graph now includes a 0.3 m clearance assumption from source boundaries to accommodate modeled wall thickness; this is not a certified accessibility clearance.

The two maps show black dashed routes with a white contrast border and a billboard destination pin. Dashes follow the route's arc length and split at turns; instancing limits draw calls. Presentation offsets leave physical routing coordinates unchanged. Directions expand on request so the map remains visible. These map packages use version 1.2.0 and are bundled offline.

## Verification

- Root type checking, production build, and embedded mobile viewer generation pass.
- 66 tests across nine files pass, including published polygon/GLB matching, signed-package verification, routing reachability, source-coordinate preservation in exploded views, dash continuity at turns, and actual mesh collision checks for every horizontal graph connection in all four furnished demos.
- Mobile lint and TypeScript checks pass. Android ARM64 Release and iOS ARM64 Release simulator builds succeed; inspection of both installers confirms the exact four updated GLBs and version 1.2.0 packages. Physical-device camera scanning and Wi-Fi acceptance remain untested.
- Browser inspection covers both models, shop selection, route creation, expanded directions, floor selection, exploded/assembled switching, and zoom.

The displayed details improve legibility and appearance. They do not establish survey accuracy or approved evacuation routes. Estancia continues to refuse unverified evacuation routing. Marikina retains its approximate-plan disclosure.

Rebuild the currently available Estancia model and distributions (Marikina is no longer in the demo catalog):

```sh
blender --factory-startup --background --python scripts/create-demos.py -- estancia-main-gf
npm run setup
npm run build
```

Model helper: `scripts/interior_details.py`. Reference snapshot/provenance: [reference-floor.md](reference-floor.md).

Previews: [Marikina interior](previews/marikina-indoor-detail.png), [Marikina floors](previews/marikina-indoor-stack.png), [Estancia interior](previews/estancia-indoor-detail.png), [Estancia route](previews/estancia-indoor-route.png).

Existing mobile installations prefer a saved package over the bundled copy. Receive version 1.2.0 from the local server, or remove the saved copy through Offline buildings and reselect the demo. Fresh installations bundle the new models without Wi-Fi.

Reusable assets, source licenses, store profiles, and restored building overview: [reusable-interior-assets.md](reusable-interior-assets.md).
