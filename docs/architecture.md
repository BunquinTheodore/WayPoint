# Architecture and validation

## Data flow

```text
Printed checkpoint → installed app → phone position
                         │
             bundled or saved package?
                         │ no
                 user-approved local Wi-Fi
                         ▼
            local HTTPS building computer
                         │
             signed package verification
                         ▼
       persistent phone files → GLB + directory + graph
                         │
    typed query → local MiniLM → destination suggestions
                         │ user chooses
                         ▼
          Dijkstra route → 3D overlay + instructions
```

## Package protocol

QR: `{ "v": 1, "building": "sm-marikina", "checkpoint": "entrance" }`. The entrance can add a `wifi` object containing the provisioned SSID/passphrase. The QR cannot replace the server address or trusted keys. A QR identifies a building and checkpoint; the model comes from bundled assets, verified phone storage, or the local server.

`GET /buildings/estancia-main-gf/manifest` provides the current package version. `GET /buildings/estancia-main-gf/packages/1.0.0.zip` provides the ZIP. Equivalent paths serve `robinsons-manila`, `estancia-main-gf`, `waypoint-tower`, and the legacy `demo-001`. Only GET is exposed. The public server is HTTPS on 8443; HTTP 8081 is loopback-only for development.

ZIP entries: `manifest.json`, `manifest.sig`, `building.json`, `building.glb`, `embeddings.json`. The signature is Ed25519 over the exact manifest bytes. File SHA-256 hashes/sizes are included in that manifest. Both compressed and declared uncompressed size are bounded at 50 MB; traversal paths, unsigned extras, missing graph references, unsupported models, and external GLB resource URLs are rejected.

`building.json` contains floor heights, room positions/sizes, navigation nodes, checkpoints, and edges. Edges specify distance, kind, step-free eligibility, and evacuation eligibility. Coordinates are meters, right-handed, Y-up. `embeddings.json` contains normalized 384-dimensional vectors and the exact embedding-model contract ID.

## Zoom behavior

OrbitControls provides one-finger orbit and two-finger pinch/pan. The camera distance is normalized to the viewport aspect ratio so portrait screens can frame the entire building. A smooth camera transition moves to a selected floor or room. From farthest to nearest:

- Building view: every floor and roof visible.
- Floor view: roof/upper floors fade away and a horizontal clipping plane reveals the selected floor.
- Room view: closer framing, selected-room label, and destination details.

The floor picker sets which level is exposed. “Show whole building” restores the exterior view. A projected label or floor-plane tap identifies a room. Navigation overlays are computed from the graph, not drawn through arbitrary meshes.

## Local AI

Tokenization uses BERT uncased WordPiece with lowercase, accent removal, punctuation splitting, and a 128-token cap. Tokens feed the quantized MiniLM ONNX model. Masked mean pooling and L2 normalization create the query vector; cosine similarity ranks the package’s precomputed room vectors. The app presents three suggestions and requires selection. Exact room-name/alias matches bypass inference; directory access remains usable if inference fails. Routing and evacuation decisions are deterministic.

## Rendering and startup performance

The viewer renders on demand rather than every display frame: a frame is drawn only while the camera moves, a transition or opacity fade is still converging, or the scene changed (`BuildingViewer.invalidate()`). A visible position marker pulses at a reduced cadence instead of forcing full-rate rendering. Phones (coarse pointer or short side under 760 px) cap the pixel ratio at 1.5 and use a 1024 px shadow map; desktops keep 2x and 2048 px. Room labels are projected only on rendered frames with a reused vector.

The startup bundle imports only the icons the interface uses (`src/icons.ts`, guarded by a test) and loads the QR decoder lazily when browser scanning starts. The browser loads the MiniLM runtime during idle time after a building activates so the first search answers immediately, and a failed runtime load is retried on the next search instead of being cached. The tokenizer builds its vocabulary lookup once per vocabulary.

## Offline boundary and security

The app installation contains the viewer, JS, native modules, tokenizer, AI weights, and all three demo map packages. A fresh native installation can switch between the demos with Wi-Fi and mobile data disabled. Updates and missing packages for provisioned buildings can be acquired from the building LAN and stored on the phone. Wi-Fi carries local data; it does not require WAN access. No internet is required to verify the package signature or server certificate. Browser preview assets must first be loaded from the development server; that preview is not the native first-launch offline test.

Guest-network isolation, server allow rules, private publisher keys, and a read-only transfer service protect the installation. No visitor search, camera frame, or location is uploaded. Physical checkpoint labels must still be inspected for relocation or replacement; digital authenticity cannot establish where a paper QR was placed.

## Device acceptance checklist

1. Install a Release build on a clean Android phone and physical iPhone. Disable all networks before first launch. Select each of the three bundled demos and confirm the model, directory, local AI, and routing. Then enable local Wi-Fi with the router WAN disconnected and test a package update through the entrance QR. Confirm system Wi-Fi permission, trusted HTTPS transfer, verified storage, and entrance positioning.
2. Decline camera, nearby-device/local-network, or Wi-Fi requests. Confirm clear recovery instructions and the manual-network fallback. Reopen and retry after permission changes.
3. Disable Wi-Fi and mobile data, force-close/restart, and scan a corridor QR. Confirm loading the stored GLB, destination inference, and routing without any network requests.
4. Pinch out until the exterior fits; pinch in to expose floors; choose all floors; tap rooms; rotate; pan; switch top-down; reset overview. Check portrait/landscape and low-memory devices.
5. Navigate from entrance to an upper-floor destination in each demo. Confirm floor changes use mapped stairs or elevators in ordinary mode, and that step-free mode excludes stairs. Scan a new floor checkpoint and confirm recalculation from that node. In the tower, scroll to floor 20 and verify full-height overview and floor cutaway.
6. Start evacuation at each checkpoint. Confirm elevators are excluded. Mark the west exit blocked and verify the east alternative. Mark both blocked and verify a no-route state. Request step-free evacuation upstairs and verify assistance instructions, not a stair route.
7. Test unknown/invalid QR, wrong building, corrupted ZIP, altered model, forged signature, missing file, external GLB URI, oversized/decompression-bomb package, full storage, unavailable server, certificate mismatch/expiry, and interrupted transfer. Preserve the prior valid package after failure.
8. Record first-load time, AI query latency, FPS, peak memory, package/model sizes, and battery use on the actual demonstration phones. Capture an internet-disconnected demonstration.

## Deployment boundary

This prototype provisions an allowlist of three demo maps plus the legacy sample, using one local server profile and publisher identity. General registration of additional buildings, trusted-key rotation, package downgrade policy, multilingual inference, hardware location tracking, live hazard feeds, and approved evacuation operations require further work. The mall models contain unverified geometry and routing; the tower is fictional. The detailed Estancia floor preserves published store polygons but estimates doorways and scale. Its evacuation routing is unavailable because safe external destinations and emergency connections are unverified. Simulator/browser tests cannot certify physical Wi-Fi joining or camera performance.
