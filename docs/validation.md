# Demo validation — 9 October 2026

## Completed checks

- 26 passing automated tests: every destination is reachable; step-free and evacuation filters work; alternate/blocked exits behave correctly; malformed QR payloads and tampered/oversized packages are rejected; tokenization and real MiniLM inference are checked.
- Actual local inference ranks Library for “I want to borrow books”, Café for “Where can I get coffee?”, and Clinic for “I need medical help”.
- Root TypeScript check and production browser/native-viewer build pass. Mobile TypeScript and Expo ESLint checks pass.
- Android ARM64 Release APK builds and installs on a Pixel 8 emulator. With both Wi-Fi and mobile data disabled, a fresh app launch reports a valid 384-dimensional embedding from its bundled model. No Metro server is involved.
- iOS ARM64 Release simulator build succeeds without signing. Native startup and the signed 3D building are checked on an iPhone 17 Pro simulator. The test package was placed directly into app storage; this does not verify Wi-Fi joining or transfer. Physical iPhone installation needs the developer’s Apple signing configuration.
- Phone-size browser checks cover whole-building framing, floor cutaways, room selection, semantic search, checkpoint positioning, and cross-floor directions. Previews are saved in `docs/previews/`.
- The editable Blender example has three floors, 18 rooms, and a separate routing graph. The signed ZIP is approximately 0.93 MB; the bundled quantized AI model is approximately 21.9 MB.
- Repository cleanup checks pass: formatting, root/mobile TypeScript, mobile lint, all 26 tests, and production viewer bundling. A clean copy containing only Git candidates successfully runs setup, creates new local keys/certificates/QR cards, builds the viewer, and passes all tests and mobile type checks. This check reuses installed dependencies and checksum-verified model files; it does not repeat their network download.

## Dependency audit

The test runner was updated during cleanup. npm still reports transitive dependency advisories in the ONNX Node installer and Expo/React Native tooling. Compatible runtime/framework upgrades need separate validation before a release; the repository is not claimed to have a clean dependency audit.

## Build compatibility

`mobile/scripts/patch-onnx.mjs` runs after dependency installation. It pins native ONNX Runtime to 1.24.3, replaces removed Gradle/React Native bridge APIs, adds iOS JSI initialization for the new architecture, and fixes Expo Constants script quoting for folders containing spaces. The local config plugin registers the Android package and preserves the iOS bundle-script quoting fix when native projects are regenerated.

## Three-building update

- 44 tests pass across five maintained test files. Vitest now limits discovery to `tests/`, excluding local checkout-validation copies.
- The three new signed GLBs load with all expected floor groups. Tower geometry extends above 72 meters; camera limits and clipping height adapt to model bounds.
- Every new destination is reachable, including through a step-free option. Upper-floor evacuation uses the required stair connections and excludes elevators; no step-free upper-floor evacuation route is invented.
- Real local MiniLM inference finds groceries in Robinsons Supermarket, movie viewing in the Marikina cinema reference zone, and the tower's sky lounge.
- Android Metro export includes all three map archives, approximately 3.2 MB combined, alongside the viewer and local AI assets. Each building has its own package storage file and QR identity.
- Android ARM64 Release and iOS ARM64 Release simulator builds succeed with the new demos. Inspection of the actual APK and simulator app confirms each contains the three signed archives with 3, 4, and 20 floors respectively. Updated installers are in `artifacts/`.
- The 390 × 844 browser preview displays all three choices in the demo picker. Mall switching, destination search, floor cutaways, tower overview, and floor 20 were checked in the browser. The picker and tower previews are saved under `docs/previews/`.
- The restarted local server returns each building's correct archive and returns 404 for an unknown building ID.

The earlier emulator validation above covers the original single-building build. See `demo-buildings.md` for the new model provenance and distinctions between directory facts and invented geometry.

## Reference-based Estancia floor

- 55 tests pass across six maintained test files. Published source vertices match both the signed room footprints and the actual GLB mesh corners.
- All 27 store/restroom destinations have connected prototype routes. Sampled graph connections avoid all included source store polygons and escalator zones, including the unnamed unit with a conflicting floor label.
- Duplicate directory entries are removed; two contradictory labels are excluded from destinations. No measured accuracy percentage is claimed.
- The browser preview loads the floor, selects individual irregular shops, displays dividing walls and estimated storefront gaps, and supports top-down inspection. Local AI identifies Pottery Barn for a home-furniture query.
- Android ARM64 Release and iOS ARM64 Release simulator builds succeed. Inspection of both installers confirms the four signed demo archives with 3, 4, 1, and 20 floors; refreshed installers are in `artifacts/`. Physical-device scanning and Wi-Fi acceptance remain untested.
- The local server delivers the Estancia manifest/archive, each file matches its recorded checksum, and unknown building requests return 404.
- The extra signed package is approximately 0.41 MB and is bundled locally. See `reference-floor.md` for source provenance, inferred geometry, and the absence of verified evacuation routing.

## Remaining device acceptance

Physical camera scanning and OS-approved connection to an isolated `Building-Maps` router have not been tested. Run the device checklist in `architecture.md`, especially first-time transfer with the router’s WAN disconnected, cached navigation after every network is disabled, permission denial, interrupted transfer, and low-memory behavior.

The demo geometry and routing are illustrative; the tower is fictional and the mall layouts are unverified. Evacuation routing has no live hazard information and needs facility review and physical verification before use in a real building.
