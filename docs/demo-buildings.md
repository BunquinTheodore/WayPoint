# Selectable demonstration buildings

All three selectable packages are signed locally and bundled into standalone mobile builds. Switching demos resets the origin to the clearly labeled demo entrance, clears routes and block reports, and loads that building's own graph and destination embeddings. Scanning a QR replaces the demo origin with a checkpoint in the matching package. The local HTTPS server serves each building separately.

| Demo             | Floors | Destinations | Geometry status                                                                    |
| ---------------- | -----: | -----------: | ---------------------------------------------------------------------------------- |
| Robinsons Manila |      4 |           24 | Referenced envelope, interpreted interior plan and estimated upper levels          |
| Estancia Main GF |      1 |           27 | Published directory polygons; partitions interpreted, doorways and scale estimated |
| Waypoint Tower   |     20 |          120 | Fictional, approximately 72 meters tall                                            |

## Archived source: SM City Marikina

This model is no longer in the selectable catalog or shipped app. Its Blender and source exports are retained for editing.

Reference: [DENR-hosted SM City Marikina Expansion Project report](https://iis.emb.gov.ph/embis/dms/documents/fileviewer2/2025/NCR/202515026661/NCR2025-FT2N26661-File_2.pdf), PDF pages 45–46, printed pages ES-11 and ES-12. The inspected sheets show ground, second, third-floor and roof-deck master plans with drawing dates in 2022.

The demo uses a broad rectangular footprint, three levels, perimeter galleries, upper atrium voids, and a separate roof. It is a simplified interpretation, not a dimensional trace or current as-built reconstruction. Its dimensions, internal partitions, destination zones, entrance, stairs, elevator, checkpoints and exits are illustrative. Labels such as "Cinema reference zone" intentionally avoid claiming verified store coordinates. Parking/service floors are simplified into demonstration destinations.

## Robinsons Manila

Reference: [official Robinsons Manila Virtual Mall Directory](https://vmd.robinsonsmalls.com/list-of-malls/metro-manila/robinsons-manila), checked 9 October 2026. Selected directory facts include Robinsons Supermarket on Level 1 in Adriatico Wing, Timezone on Level 2 in Pedro Gil Wing, Robinsons Appliances on Level 3 in Pedro Gil Wing, and Movieworld on Level 4 in Midtown/Pedro Gil wings.

The envelope now follows OpenStreetMap geometry. A manually interpreted user map supplies circulation and shop-row patterns; photographs inform the curved frontage, atriums and residential context. Four retail levels contain 294 modeled bays and 24 named destinations. Upper-level divisions, exact tenant positions and vertical links remain estimates. No evacuation route is fabricated. See [robinsons-manila-reference.md](robinsons-manila-reference.md) for the source archive, build workflow and limits.

## Estancia Main Mall ground floor

Added as a stronger reference-based alternative. Published individual store polygons are preserved, with dividing walls and estimated storefront gaps. Twenty-five stores and two restrooms are navigable; no emergency route is fabricated. See [reference-floor.md](reference-floor.md) for source provenance, exclusions, and accuracy limitations.

## Waypoint Tower

A fictional twenty-floor tower demonstrates the entire building at overview scale, scrollable floor selection, zoom cutaways, local search across 120 destinations, elevator routes, and stairs in evacuation demonstrations. It has a ground-floor reception, clinic and café, office/shared-space floors, and a top-floor sky lounge. Both stair connections are represented in the graph on every level. Upper floors have no modeled step-free evacuation route; the app returns the assistance message rather than routing through an elevator.

## Asset workflow and verification

`scripts/create-demos.py` runs in Blender and creates each `.blend`, `building.glb` and `building.json`. `npm run model` creates destination embeddings using the pinned local MiniLM model. `npm run package:building` signs each package with the checkout's Ed25519 key. `npm run qr` writes per-building cards under `checkpoints/<building-id>/`. `npm run build` copies the three ZIPs into mobile assets, emits static Metro asset references, and precaches only the browser app shell. Selected packages, viewer code, and used AI assets are cached on demand.

Automated checks load the actual GLBs, verify signed identities and floor groups, route to every destination, test step-free routes, exclude elevators during evacuation, and exercise local AI against each demo. Native bundle export verifies that all three archives are included as assets. These checks establish prototype consistency, not real-world map accuracy.

For a real facility, replace illustrative geometry and connections with current authorized plans, measurements, and facility-reviewed navigation data. Demo exits and checkpoints must never be used as the actual mall's evacuation instructions.
