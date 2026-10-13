# Robinsons Manila reference archive

Retrieved 9 October 2026 for Waypoint's reference reconstruction. These files are build-time references; the mobile/web demo does not fetch any of them over the internet.

## Photographs

All three JPEGs are unchanged downloads by **Ralff Nestor Nacor (Ralffralff)**, photographed **1 May 2025**, licensed **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. The originals and author attribution are on the linked file pages:

| Local file                    | Original and evidence                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `exterior-pedro-gil-2025.jpg` | [Exterior (1)](<https://commons.wikimedia.org/wiki/File:Robinsons_Place_Manila,_May_2025_(1).jpg>): curved entrance, balcony bands, glass frontage, columns and identity sign. |
| `exterior-wide-2025.jpg`      | [Exterior (2)](<https://commons.wikimedia.org/wiki/File:Robinsons_Place_Manila,_May_2025_(2).jpg>): drop-off canopy, palm trees and adjacent residential towers.               |
| `interior-pedro-gil-2025.jpg` | [Interior (1)](<https://commons.wikimedia.org/wiki/File:Robinsons_Place_Manila_Interior,_May_2025_(1).jpg>): open atrium, rounded galleries, glazing and roof trusses.         |

Photos are reference material, not baked textures. The model interprets architectural features; it is not photogrammetry. No complete real tenant fit-out is established by these views.

## Geodata and interior trace

`osm-site.json` contains the mall perimeter, retail site, and associated residential building parts from the [OpenStreetMap API](https://www.openstreetmap.org/api/0.6/map?bbox=120.9815,14.5725,120.9860,14.5790). Mall building: [way 130532101](https://www.openstreetmap.org/way/130532101). Site polygon 48894714 is retained for reference only, not used as the mall's building footprint. Tower building parts: 533298895, 533298896, 533298899, 533298900, 533298901.

© **OpenStreetMap contributors**. Source geodata and the OSM-derived exterior component of `geometry.json` are available under the **[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)**; see [OSM copyright and attribution](https://www.openstreetmap.org/copyright). Interior interpretation has separate user-supplied reference provenance; this statement does not grant rights to the third-party map screenshot. The local projection uses an approximate meter conversion near the mall. OSM heights and outlines are community data, not a certified survey.

The user's screenshot, `Screenshot 2026-10-09 at 11.41.39 PM.png`, provides the interior reference. The original basemap image is **not redistributed** in this repository. Its visible floor selector/date/scale are absent. Level 1 is a working interpretation, not a confirmed source fact. The image is cropped at the north end. A smooth control-point registration maps hand-interpreted shop rows and circulation to the OSM perimeter; its corrections can distort local unit dimensions. Shop boundaries are therefore approximations, not extracted official CAD polygons. Neither the manually read screenshot nor the model should be represented as an open-licensed official indoor floor plan.

`plan-review.svg` is a diagnostic drawing of the reconstruction, with demo route lines, not a copied basemap. `geometry.json` includes triangulated slabs, real geometric holes on upper levels, individual store polygons, and a route graph generated through free floor space.

## Official directory

- [Robinsons virtual mall directory](https://vmd.robinsonsmalls.com/list-of-malls/metro-manila/robinsons-manila): evidence for the selected tenant names, levels and wings; not evidence for their precise storefront coordinates.
- [Official mall information](https://robinsonsmalls.com/mall-info/robinsons-place-manila): address, mixed-use context, seven-level overall complex. The model exposes four retail levels from the directory; seven overall levels do not establish seven interchangeable retail floors.

The Savills page's “Floor Plan” images were inspected and found to be placeholders, so they were not used. Unrelated Robinsons mall plans from image search were also excluded.
