# Waypoint

A mobile building guide that works when cloud services are unavailable. The installed app includes three selectable demonstration maps and local AI. Scanning a checkpoint locates the visitor in the selected map. Signed package updates can come from a computer on the building’s local Wi-Fi, with no internet connection.

## Challenge track: Sustainability & Social Impact

Waypoint addresses a public-interest gap: indoor wayfinding that people can rely on when it matters most, regardless of connectivity, mobility, or language.

- **Accessibility:** step-free routing avoids stairs and steps, and accessibility needs stay on the device.
- **Emergency resilience:** evacuation routes exclude elevators and keep working when cell networks are saturated or down.
- **Equitable access:** runs fully on-device with no internet, account, or data plan, and understands English and common Filipino/Taglish phrasing.
- **Privacy by design:** position, searches, and accessibility needs never leave the phone, and no telemetry exists.
- **Low-infrastructure deployment:** a single computer on the building’s local Wi-Fi can deliver signed map updates, so no cloud service is needed.

## Local AI at a glance

**What runs locally, on the phone, with no network at all**

- Destination search: `all-MiniLM-L6-v2` (quantized ONNX, ONNX Runtime) embeds the visitor’s request and ranks the building’s mapped places by cosine similarity against vectors precomputed inside each signed building package.
- Navigation chat: `Qwen3-1.7B` (Q4_K_M GGUF, llama.cpp via llama.rn) classifies a request into a small JSON intent. It never writes a route, a distance, or a direction.
- Everything that produces an answer: Dijkstra routing over the building graph, step-free and evacuation constraints, floor and elevator requests, building facts such as “what is on level 2”, Filipino/Taglish word translation, and the guardrails that decline off-topic input.
- The 3D map, QR checkpoint scanning, and the three bundled building packages.

**What requires internet or a network**

- Development only: `npm run setup` and `npm run setup:chat` download the two model files once, with pinned revisions and checksums, before the app is built.
- Optional, local Wi-Fi only: receiving an updated building package from the on-site computer over the building’s isolated network. No internet is involved.
- Nothing at runtime. The installed app makes no cloud or API call for navigation, search, or chat.

**Why this product benefits from running AI locally**

Visitors use a building guide exactly where connectivity fails: mall basements, parking levels, hospital corridors, and during an emergency when cell networks are saturated. A cloud assistant is unusable there; this one is not. Keeping inference on the device also means the visitor’s position, searches, and accessibility needs never leave the phone, no account or telemetry exists, and answers arrive in about a second without a round trip. Local inference is not a feature of this app; it is the reason it works.

## What is implemented

- React Native/Expo app for Android and iPhone, with a fully bundled Three.js viewer in a WebView.
- Three demo choices with editable Blender files and self-contained GLBs: Robinsons Manila (four floors), Estancia Main Mall ground floor (one floor), and fictional Waypoint Tower (twenty floors). The original Meridian Learning Center remains available as a source/testing example.
- Visible layout disclosures: Robinsons has directory-based store floors and invented geometry. These mall demos are unverified. Estancia preserves official directory store polygons with estimated doorways and scale; see `docs/reference-floor.md` and `docs/demo-buildings.md`.
- One-finger orbit, two-finger pinch/pan, zoom buttons, whole-building reset, top-down view, and floor selection. Zooming inward hides upper floors and cuts away walls; tapping a room focuses the camera and opens navigation.
- Estancia uses monochrome cutaway interiors with capped shop partitions and escalator symbols; its routes use dashed lines and a map pin. All three demos now reuse Kenney CC0 furnishings with different store profiles. See `docs/interior-style.md` and `docs/reusable-interior-assets.md`.
- QR checkpoint positioning. The marker is the last confirmed position, not continuous tracking.
- Mapped graph routing, step-free navigation, evacuation connections that exclude elevators, and session-local blocked connections.
- Local English semantic destination search using quantized MiniLM and ONNX Runtime. The user chooses a suggested destination; the model does not generate or approve routes.
- Navigation chat in English and common Filipino/Taglish phrasing with an optional bundled Qwen3-1.7B interpreter, destination confirmation, step-free and nearest-place requests, floor and elevator requests, routes between two places, building facts, and follow-up context. See [offline chat setup and device validation](docs/local-chat.md). Run `npm run setup:chat` before building to include the full local interpreter.
- HTTPS package server, app-provisioned certificate trust, Ed25519 package signatures, hashes, size limits, and persistent package storage.
- A demo picker in both mobile and browser views, independent package storage, printable QR cards per building, and camera framing/cutaways that adapt to mall footprints and the full tower height.

## Run the browser preview

Use Node.js 22.18 or newer and npm. Initial setup downloads the pinned AI model and generates local certificates, signed packages, and QR cards. OpenSSL must be available for certificate generation. These development steps happen before deployment; installed apps contain their AI dependencies.

```sh
npm ci
npm run setup
npm run dev
```

Open the local URL printed by Vite. First launch opens the lighter Estancia ground-floor map; choose **Demos** to switch buildings. To test local delivery, run `npm run server`, then choose **Offline buildings → Receive from local demo server**. The selected building’s package is received through Vite’s loopback-only development proxy.

The browser’s camera requires localhost or a trusted HTTPS origin. Native camera scanning is the intended phone flow. Production preview (`npm run build`, then `npm run preview`) precaches the small app shell. Only the selected building archive is fetched and parsed; the 3D viewer, camera decoder, and semantic-search code load on demand. Opened buildings and used AI assets are cached for later offline browser visits. Native builds bundle all three maps and local AI for first-launch offline use, but initialize only the selected building and defer AI inference until a semantic query. Static meshes are batched per floor/material, shadow maps refresh only when needed, and replaced models release their GPU resources.

## Configure building Wi-Fi

1. Use a dedicated router/access point with SSID `Building-Maps` and WPA2 visitor passphrase `waypoint-demo` for this demo. The router needs no WAN/internet connection.
2. Connect the server computer to that router, preferably by Ethernet. Give it a fixed LAN IP or DHCP reservation.
3. Separate this visitor network from staff, CCTV, and building control systems. Isolate visitor clients from each other, while allowing them to reach this server on TCP 8443.
4. Before generating the certificate and app, connect the computer to the final LAN. `npm run package:building` creates a local HTTPS certificate containing the computer’s current IPv4 addresses. It also creates a package-signing key in `.local/`.
5. Build with the final address, for example:

```sh
WAYPOINT_SERVER=https://192.168.1.2:8443 npm run build
npm run server
```

The build produces `mobile/assets/building-profile.json`, bundles the three signed demo archives, server certificate, package public key, viewer, and AI dependencies. The profile allowlists the three demo IDs and the original Meridian ID. Never ship `.local/` private keys inside the app or expose server administration to visitors. Keep those keys backed up privately.

If the server IP changes after certificate creation, regenerate the demo certificate under `.local/`, rerun packaging, and rebuild the app with the new address. Certificate or publisher-key replacement requires rebuilding/reprovisioning this prototype; it does not silently trust new keys from a QR.

For a different SSID/password, set `WAYPOINT_SSID` and `WAYPOINT_WIFI_PASSWORD` consistently when building and printing QR cards. These are public visitor credentials, not administrative credentials. QR payload Wi-Fi fields must match the provisioned profile.

## Build the installed mobile app

```sh
npm run build
cd mobile
npm ci
npx expo prebuild --no-install
```

Android (use the installed JDK and Android SDK paths on your machine):

```sh
cd android
./gradlew :app:assembleRelease
```

On Windows, if the repository lives in a deep folder such as OneDrive, the release native build can fail with "Filename longer than 260 characters": the autolinked C++ build mirrors each dependency's full source path. Enable Windows long paths as an administrator (`LongPathsEnabled` under `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`, then reboot), move the repository to a short path such as `C:\wp`, or build the release APK on macOS, Linux, or EAS. The debug build (`npx expo run:android`) is not affected.

The demo APK is generated at `mobile/android/app/build/outputs/apk/release/app-release.apk`. Expo’s generated release project uses its debug signing key for local demonstration; set up a private release keystore before distributing it publicly. This APK contains the JavaScript, the search model, and the building packages, and does not require Metro, Expo Go, EAS, or an internet connection to launch.

The chat interpreter (1.1 GB) is too large for Metro to embed, so it is pushed to the phone once after installation:

```sh
adb install mobile/android/app/build/outputs/apk/release/app-release.apk
# launch Waypoint once, then
npm run chat:sideload
```

Expo Go cannot run this app: the chat runtime, ONNX Runtime, and the Wi-Fi module are native code that Expo Go does not include. Use the release APK above, or `npx expo run:android --device` for a development build on a USB-connected phone.

iPhone:

```sh
cd ios
pod install
```

Open `Waypoint.xcworkspace` in Xcode. Use a Release configuration for an offline installation. Physical iPhones require your own Apple development signing setup and the Hotspot Configuration entitlement. The iOS Wi-Fi API is not a usable Wi-Fi test in the simulator; test joining the building network on a physical iPhone.

The app contains a local Expo module under `mobile/modules/waypoint-network`. Android requests a local-only Wi-Fi network and sends package traffic through that specific network. iOS requests permission using Hotspot Configuration, forbids cellular downloads, and trusts only the provisioned building certificate with normal hostname/date checks. Both platforms retain manual Wi-Fi joining as a fallback.

## Visitor interaction

1. Install the standalone app before arriving.
2. Choose **Demos** to explore any included building immediately. The starting marker is explicitly a sample position.
3. For a checkpoint demonstration, scan a matching printed entrance QR **inside Waypoint**. Required camera permissions apply.
4. If an allowlisted package is missing, approve the Wi-Fi prompt. The app receives it from the local server, verifies its signature, saves it, and locates the visitor at that checkpoint. “No internet” is expected. Bundled demo packages skip this transfer.
5. Choose a destination or type something like “Where can I borrow books?” Select the desired suggestion and follow the mapped directions.
6. Scan the next checkpoint to update position. On subsequent visits, a saved package skips the Wi-Fi transfer.

A QR cannot transfer the complete model. A new visitor cannot receive a missing package if both the local server and local Wi-Fi are unavailable. Already saved packages continue working.

## Edit the Blender example

The selectable models are `blender/estancia-main-gf.blend`, `blender/robinsons-manila.blend`, and `blender/waypoint-tower.blend`. SM City Marikina remains an editable source asset but is excluded from the demo catalog and shipped app assets. Recreate them with:

```sh
blender --factory-startup --background --python scripts/create-demos.py
npm run setup
npm run build
```

Pass a building ID after `--` to regenerate only that model, for example `-- waypoint-tower`. These examples use shared box geometry, floor groups named `Floor_0` through `Floor_19`, and separate roof groups. The tower is approximately 72 meters tall. Catalog labels and provenance live in `demo-catalog.json`; model geometry and route metadata are created together in `scripts/create-demos.py`. The detailed Estancia floor uses `scripts/create_estancia.py` and the offline source snapshot in `references/estancia-main-gf.json`.

Open `blender/meridian-learning-center.blend`. The generated scene is named **Waypoint Learning Center**. Floor groups are `Floor_0`, `Floor_1`, and `Floor_2`; `Roof` is independently removable. Geometry and navigation metadata use meters, with glTF/Three.js Y-up coordinates.

`scripts/create-building.py` recreates the example in a new Blender scene and exports `public/demo/building.glb` and `building.json`. It preserves other existing scenes. Run with Blender’s Python environment:

```sh
blender --background --python scripts/create-building.py
npm run model
npm run package:building
npm run qr
npm run build
```

After editing routes or room layout, update the navigation graph as well as the GLB. Routing does not infer corridors from meshes. Replace a cached building through package import/local download when iterating on the same demo version.

## Validation and limitations

Locally generated demo installers can be kept in `artifacts/`; they are excluded from Git. The Android demo targets ARM64 phones and uses the configured local server at `https://192.168.1.2:8443`. Build and test evidence is recorded in `docs/validation.md`; mobile previews are in `docs/previews/`.

An ARM64 iOS simulator build is for local Mac testing. Physical iPhones use the Xcode signing steps above. Native builds are checked against the bundled viewer and AI assets, and the generated asset revision forces Android to rebuild its bundle when those files change.

After `npm run setup`, run `npm run check` for TypeScript, routing, QR, tokenizer, package-integrity, local inference, and formatting checks. Run `npm run check --prefix mobile` after installing mobile dependencies for Expo lint and mobile type checks. Use `npm run format` to format maintained sources. The device checklist and architecture are in `docs/architecture.md`.

This is a fictional navigation demonstration, not an approved evacuation system. There are no live fire, obstruction, congestion, alarm, or structural-damage inputs. Emergency routes need facility-specific review, accessibility review, physical verification, and supervised drills before real use. A valid digital signature proves the package came from the trusted publisher; it does not prove that a route is currently safe.

The prototype supports its allowlisted demo buildings, one provisioned local server/network, and English typed requests. There is no continuous positioning, AR tracking, visitor account, cloud API, or telemetry integration. Hardware camera scanning, Wi-Fi permissions, battery use, and on-device inference performance require physical Android/iPhone tests.

## Models and tools (hackathon disclosures)

**Models**

- `Xenova/all-MiniLM-L6-v2`, quantized ONNX export of Sentence Transformers MiniLM (Apache-2.0), for destination embeddings. Exact revision and file hashes are in `public/ai/model-info.json`.
- `Qwen/Qwen3-1.7B` as `Qwen3-1.7B-Q4_K_M.gguf` from `unsloth/Qwen3-1.7B-GGUF` (Apache-2.0), for chat intent classification. Revision and hash are in `chat-model.json`.

**Runtimes and frameworks**

- ONNX Runtime (`onnxruntime-react-native` on phones, `onnxruntime-web` WASM in the browser preview, `onnxruntime-node` for build-time embeddings and tests).
- llama.cpp through `llama.rn` on phones; a local `llama-server` for browser development only.
- React Native, Expo, TypeScript, React Native WebView, Three.js (OrbitControls, GLTFLoader), Vite, Vitest, esbuild, Prettier.
- Node.js HTTPS/crypto, fflate, Noble Ed25519/SHA-256, Expo Camera, jsQR, qrcode, lucide icons.
- Blender 5.1.1 for the building models and editable `.blend` files.

**APIs and cloud services**

- None at runtime. Hugging Face is used once during development to download the pinned model files.

**Existing code and assets**

- Kenney CC0 furnishing kits (`assets/vendor/kenney`) for interior props.
- Robinsons Manila geometry references OpenStreetMap data (© OpenStreetMap contributors) and the public mall directory; Estancia store outlines follow the official Ortigas Malls directory. See `docs/demo-buildings.md` and `docs/robinsons-manila-reference.md`.
- All application code, building graphs, scripts, and tests were written during the hackathon (first commit 9 October 2026, 5:35 PM).

**AI development tools**

- Claude Code (Anthropic) and OpenAI Codex were used for coding assistance, test writing, and reviews throughout the build. Add any other assistant used by the team here before submission.

Development dependencies and pretrained weights are obtained before deployment. Runtime navigation never downloads AI weights or calls an internet service.

## Repository contents

Git includes the editable Blender model, exported GLB, building graph, model revision and checksums, source code, dependency lockfiles, tests, and documentation. Downloaded model weights, WASM, generated native projects, build outputs, installers, local settings, private keys, and generated trust/profile files are ignored. `npm run setup` regenerates model assets and local distribution files; `npm run build` creates the bundled mobile assets before native prebuild.

Each checkout creates its own signing key and certificate. To build an app for an existing installation, restore that installation’s keys into `.local/` securely before running setup. Keep the signing key and HTTPS private key on the server/developer machine; the app receives only the public key and certificate.
