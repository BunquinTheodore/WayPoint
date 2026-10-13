# Reusable offline interiors

Waypoint includes 43 existing models from **Kenney**, rather than generating a new model for every store. Their original GLBs and licenses are checked into `assets/vendor/kenney/`. The manifest records the source download URL, archive hash, individual file hash, and file size.

- [Furniture Kit](https://kenney.nl/assets/furniture-kit): desks, screens, keyboards, shelving, sofas, chairs, tables, coat racks, mirrors, plants, and coffee equipment.
- [Food Kit](https://kenney.nl/assets/food-kit): drinks, baked goods, fruit, packaged goods, and meal props.
- Both are **CC0-1.0**. The original license text is retained beside each kit. These are third-party artist-made assets; no image-generation service is involved.

## What differs between stores

`scripts/reusable_assets.py` selects a furnishing profile from the destination name/category, then varies arrangements deterministically. Electronics stores use display desks and computers; home stores use sofas, lamps, and bookcases; fashion stores use coat racks and shelving; grocery stores use shelves and food props; cafes/restaurants use different table/chair combinations and drink/meal props. Eyewear and beauty profiles use mirrors or bottle displays. The fictional tower uses office and lounge furnishings.

The imported props make the models more recognizable, but **their arrangement and merchandise are illustrative, not reconstructions of actual tenant interiors**. Store outlines and source accuracy retain their existing limitations. No branded products or measured fit-outs are claimed.

Each prop must fit inside its assigned unit, including a wall margin. The center aisle remains clear. Model extras record `asset_name`, `asset_pack`, `asset_license`, and `asset_author`. The building metadata records the models used and `fitoutsVerified: false`.

## Offline packaging

Blender imports each prop once per building, normalizes its origin, and reuses the mesh for repeated placements. Palette textures are removed to keep the existing monochrome presentation and avoid external image dependencies. The resulting building GLB contains all necessary geometry and materials; phones never contact Kenney to display it.

All four updated demo packages are version **1.2.0**. Existing saved packages take priority over bundled copies: receive the new package from the local server, or remove the saved copy and reopen the demo. Freshly built mobile installations include the new packages.

To rebuild entirely from the vendored sources:

```sh
blender --factory-startup --background --python scripts/create-demos.py -- robinsons-manila estancia-main-gf waypoint-tower
npm run setup
npm run build
```

The Blender step needs no network. `setup` uses the previously provisioned local AI weights, creates embeddings, signs building archives, and prints QR cards. Provision those weights before an offline development session.

## Building view

Opening a demo or choosing **Show whole building** returns to the assembled model, including the modeled exterior and roof. Zooming in opens the cutaway floor view. The view chip toggles exploded floors; selecting a floor or destination remains available in either layout. Estancia continues to show its one documented floor; an unsourced full-mall exterior is not fabricated.

## Validation

The model tests load the GLBs, check source/license metadata and varied asset types, confirm props require no image textures, and raycast every horizontal routing connection against walls and imported furnishings. UI verification covers the assembled overview, exploded view, and selecting a furnished destination. All 66 tests pass. Android ARM64 Release and iOS ARM64 Release simulator builds succeeded; both installers were inspected to confirm the exact four version 1.2.0 packages and GLBs. Physical-device camera and local Wi-Fi transfer remain untested.
