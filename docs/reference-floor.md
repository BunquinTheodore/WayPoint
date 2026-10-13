# Estancia reference-based ground floor

**Estancia · Main Mall GF** adds one detailed floor alongside the existing three demos. It uses published store shapes rather than generic rectangles. It does not claim measured 80% accuracy.

## Reference selection

SM Marikina's [DENR-hosted redevelopment report](https://iis.emb.gov.ph/embis/dms/documents/fileviewer2/2025/NCR/202515026661/NCR2025-FT2N26661-File_2.pdf) contains plans dated April/May 2022. The plan images on PDF pages 45–46 are approximately 885 × 614 pixels, embedded as compressed JPEGs. They identify broad areas and some boundaries but do not reliably establish every current storefront, shop division, or tenant. The Marikina demo retains its approximate label.

The [official Ortigas Malls Estancia directory](https://www.ortigasmalls.com/mall-directory?selectedMall=7) supplies a blueprint and polygon coordinates for individual named areas. The selected floor is **Main Mall, GF**, source floor ID **88**. Its polygons are directory click areas, not certified architectural wall drawings.

The snapshot was retrieved on **9 October 2026**. `references/estancia-main-gf.json` retains names, category codes, locations, coordinates, source URLs, and a hash of the blueprint inspected. Contact numbers, photographs, and visitor information are omitted. The app renders generated local geometry; it does not contact the directory or download the blueprint at runtime.

## Reference fidelity

- Published polygon vertices are transformed into the model without replacing irregular outlines with rectangles. Neighboring dividers follow these outlines.
- There are **25 named store destinations and two restroom destinations**. Navigation ends at their modeled storefront openings.
- The source has 36 named polygon records. Exact duplicate records for Skoop (4978) and Yves Rocher (9713) are removed. Two contradictory floor labels are excluded from destinations: Lacoste (4992) says LG and Aukey (7837) says 2F despite appearing in the GF dataset. The Lacoste polygon remains an unnamed partitioned area; the ambiguous Aukey kiosk is omitted.
- Two escalator zones follow published markers and are obstacles to horizontal routing. No upper-floor connection is invented.
- A corridor band is sampled around the directory's unnamed two-point connector lines. Their routing role is an inference. Collision checks and local path search keep gallery connections outside store and escalator polygons.
- Three published Exit markers remain reference labels. No assembly point or emergency-safe connection is fabricated; this floor returns no evacuation route.

## Estimated elements

Scale is **0.2 meters per directory coordinate unit**, an unmeasured visualization assumption. Distances remain approximate. Wall heights/thicknesses, materials, opening widths/positions, the outer floor perimeter, and slab are inferred. Generic display counters and cafe seating are illustrative details; actual tenant fit-outs, structural columns, service spaces, and other floors/wings are unverified or omitted. Low capped walls are a cutaway drawing convention. Escalator tread/rail symbols add no upper-floor route. See [interior-style.md](interior-style.md).

Published polygons may be simplified or stale. Matching their coordinates establishes fidelity to this snapshot, not agreement with the actual facility. A digital signature authenticates the publisher, not map correctness.

## Rebuilding and verification

```sh
blender --factory-startup --background --python scripts/create-demos.py -- estancia-main-gf
npm run setup
npm run build
```

`blender/estancia-main-gf.blend` is editable. `scripts/create_estancia.py` generates its partitions, footprint meshes, doorway gaps, directory, and graph. `public/demos/estancia-main-gf/reference-report.json` records assumptions and exclusions. The signed mobile package contains the GLB, graph/directory, and local destination embeddings. It is bundled for first-launch use without Wi-Fi.

Tests compare room polygons and actual GLB mesh vertices to source coordinates, reject malformed footprints, verify reachability, and sample routes for store-interior crossings. Screen-tap selection uses irregular footprints so a shop's bounding rectangle cannot incorrectly select a corridor.

## Establishing an accuracy target

An "80% accurate" claim needs a defined scope and current ground truth. For this floor, obtain a scale measurement and inspect store boundaries, entrances, corridor connections, escalators, and level changes on site. Mark each element confirmed, changed, or unknown. Compare dimensions and positions against agreed tolerances and report the fraction verified. Do not combine visual similarity, destination completeness, and route correctness into an unexplained score.

Real evacuation use additionally requires facility-approved exits, safe external destinations, accessible escape arrangements, and physical route checks. Those are absent for this reference floor.
