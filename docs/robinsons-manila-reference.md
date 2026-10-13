# Robinsons Manila reconstruction

Waypoint's Robinsons demo now uses a reference-based building envelope and an interpreted interior plan instead of the previous generic rectangle with eight rooms per floor. It is a visual/navigation demonstration, **not a surveyed map or approved evacuation plan**.

## What changed

- The mall envelope follows the irregular OpenStreetMap building footprint, including its long northern wing, large western anchor and recessed southern frontage.
- Four retail levels contain **294 modeled store bays** (84, 84, 63, 63). The shorter upper levels and two-level northern portion are massing estimates. The cropped northern end remains uncertain.
- Circulation follows the supplied map's north spine, central junction and southern loop. Individual partitions include storefront openings; upper slabs contain actual atrium holes.
- The southern frontage has cream/white balcony bands, blue glazing, cylindrical columns, projecting awnings, a drop-off canopy, palms and red Robinsons lettering. These elements interpret the May 2025 exterior photos.
- Surrounding residential towers are omitted from the runtime model and Blender scene to keep this demo focused on the mall. Their reference data remains archived.
- Twenty-four selected destinations retain official directory floor assignments. Their exact polygons are estimated; routes stop at the modeled storefront. Other bays remain anonymous rather than acquiring invented tenant names.
- Kenney CC0 furniture varies across cafe, restaurant, fashion, electronics, home, pharmacy and anchor-store arrangements. It is not a claim about actual merchandise or fit-outs.
- The old invented emergency exits/refuges/assembly points are removed from Robinsons. Emergency routing declines to produce an unverified route. The fictional tower still demonstrates evacuation behavior.

## Evidence and uncertainty

| Feature                                | Evidence                            | Remaining uncertainty                                                    |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Outer envelope                         | OSM way 130532101                   | Community geometry; not a measured survey                                |
| Ground-level divisions and circulation | User-provided indoor-map screenshot | Cropped, floor/date/scale unstated; hand interpretation and registration |
| Upper-floor shop divisions             | Ground layout + interior photos     | Estimated; no complete per-floor source plan obtained                    |
| Tenant names and levels                | Official Robinsons directory        | Precise storefront coordinates and fit-outs unverified                   |
| Curved facade and atriums              | May 2025 photographs                | Heights, dimensions and hidden sides estimated                           |
| Residential context                    | OSM building parts + photos         | Simplified massing; no condo interiors                                   |
| Routes and vertical links              | Generated clear-space graph         | Demonstration only; requires an on-site walk-through for operational use |

See the [reference archive](../references/robinsons-manila/README.md) for source links, image authors and license information. Source photography remains local to the repository and is not downloaded by the running app. The building package contains model geometry, room/routing data and AI search vectors.

## Rebuild

1. Install Python 3 with `shapely>=2.1` in a development environment.
2. Run `python3 scripts/prepare_robinsons.py` to regenerate the geometry dataset from the local OSM snapshot and editable trace. No network access is needed.
3. Run Blender: `blender --factory-startup --background --python scripts/create-demos.py -- robinsons-manila`.
4. Run `npm run model` (reuses the downloaded local AI model), `npm run package:building`, then `npm run build` to update signed offline packages and the mobile bundle.
5. Run `npm test` for package, routing, AI and model checks.

The editable source is `blender/robinsons-manila.blend`; the self-contained runtime model is `public/demos/robinsons-manila/building.glb`. The geodata-derived dataset is separately attributed under ODbL; see the archive's license notes. Reference colors opt into preservation through the `Reference:` material prefix, while existing demos retain their neutral palette.

## Next accuracy improvements

Obtain a dated operator directory for each retail level and a scale/dimension reference. Confirm the north wing's level extents and entrances, then survey lift/escalator positions and storefront changes. Replacing estimated polygons with those references improves actual accuracy more than adding decorative detail. No percentage accuracy is currently supportable.

## Verification and previews

Verified after the 2.1.0 rebuild: production web build, generated mobile viewer/assets, all **70 automated tests**, formatting, and Python syntax checks. Tests cover signed package identity, all destination connections, local semantic search, physical furniture/wall collisions, routes outside store interiors and upper-floor voids, upward-facing floor geometry, and refusal to invent evacuation paths. Desktop and 390 × 844 browser layouts were inspected; this is not a physical-device performance benchmark.

The signed Robinsons package is approximately **1.23 MB compressed**. Its runtime GLB is self-contained; no reference photograph or external 3D asset is fetched by the app. Exterior, roof and floor details are batched independently so their visibility and floor selection still work. Large anchor areas use sparse, simple shelf aisles instead of hundreds of tiny imported fixtures.

- [Exterior Blender render](previews/robinsons-manila-exterior.png)
- [Ground-floor Blender render](previews/robinsons-manila-interior.png)
- [Verified app view](previews/robinsons-manila-app.png)

Renders and map views incorporate building geometry © OpenStreetMap contributors. Recreate the standalone renders with `blender --background --python scripts/render-robinsons.py`.

## Mall-only optimization (10 October 2026)

Removed all surrounding residential towers. The floor plan, 24 destinations and route graph remain unchanged. The large western anchor is assigned to Robinsons Supermarket on the ground floor; its tiny repeated objects were illustrative furnishings, not verified fixtures. These now use at most 24 simple shelf aisles per anchor instead of a dense 7 m grid of imported objects.

| Metric                           |   Before |    After |
| -------------------------------- | -------: | -------: |
| Runtime GLB                      | 12.26 MB |  6.85 MB |
| Compressed signed package        | 1.94 MiB | 1.23 MiB |
| Scene triangles                  |  552,066 |  328,349 |
| Renderable meshes after batching |    2,828 |      245 |

Mesh counts are measured from the parsed GLB after the app's batching pass, not a physical-phone FPS benchmark. Batching now combines compatible exterior and roof pieces while preserving independent floor, shell, roof and furniture visibility. The ground platform is fitted to the mall's bounds plus 90 m total padding in each direction, and sits below the lowest slab.

[Updated mall-only app view](previews/robinsons-manila-lightweight.png)
