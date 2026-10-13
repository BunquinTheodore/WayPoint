# Offline navigation chat

Waypoint's English navigation assistant targets the iPhone 13. It uses a local language model to interpret a request, the existing MiniLM embeddings to retrieve mapped destinations, and deterministic graph routing to calculate distances and directions. Model output never becomes a route, a coordinate, or a claim about a live hazard.

## Model and runtime

- Interpreter: `Qwen/Qwen3-1.7B` as `Qwen3-1.7B-Q4_K_M.gguf` from `unsloth/Qwen3-1.7B-GGUF`, Apache-2.0, approximately 1.1 GB. The revision and SHA-256 are pinned in `chat-model.json`.
- Native runtime: `llama.rn` 0.12.9. Metal offload on iOS, with CPU initialization fallback. Android runs on the CPU with four threads. No cloud API, API key, or Apple Intelligence dependency.
- Settings: 2,048-token context, one request at a time, at most 160 output tokens, non-thinking mode, JSON-schema-constrained output. No accumulated full transcript in the model context: each request carries the previous destination query and up to three offered names.
- Retrieval: the existing quantized MiniLM model and precomputed building embeddings. English only.
- Memory: lazy model loading, memory-mapped weights, small inference batches, release after 45 seconds idle, release on backgrounding or memory warning. Real peak memory and response latency must be measured on the demonstration iPhone; model file size is not RAM usage.
- Android staging: expo-asset copies an embedded resource into the app cache directory before it can be opened by path, so the installed app stages the weights once in the background right after the viewer loads. Expect roughly double the model size in device storage (the APK plus the staged copy), and a slower first chat turn if the visitor asks before staging finishes. iOS reads embedded assets in place.

The 1.7B 4-bit model replaced an earlier Qwen3-0.6B Q8 choice after the desktop evaluation in `check:chat`: the 0.6B model passed 13 of 15 intent checks and copied a prompt example ("library borrow books") into an unrelated food request, while the 1.7B model passed 15 of 15 with similar desktop latency. This is a narrow-task result, not a general benchmark; the model's job is deliberately limited to classification. Runtime settings and request schemas live in `mobile/chat.ts`, `src/chat-intent.ts`, and `src/chat-runtime.ts`.

## Behavior

Open **Ask Waypoint** beside the checkpoint button. Ask for a destination or a need, then select a suggested place to see the mapped route. Follow-ups include **Avoid stairs**, **Another one**, **Closer**, and **The second one**. Explicit simple follow-ups use application logic and do not need another language-model invocation.

Stair avoidance is understood in many phrasings ("I don't want to use stairs", "I can't climb stairs", "use the elevator", "my knees are bad", wheelchair, stroller) by `explicitRoutePreferences` in `src/chat-intent.ts`, which is the only authority for the step-free flag; the model cannot switch it on or off. In the chat, a pure preference such as "I don't want to use stairs" needs no model call: if a route is on screen it is re-planned over step-free connections (elevators, since stairs edges are marked not accessible in the graph) and the reply reports the new distance or that no step-free route exists; otherwise the preference is kept for the next search. A message that combines the preference with a destination ("I don't want to use stairs, I want to go to the supermarket") searches the destination with step-free routing selected. The search box applies the same parsing: it strips the preference phrase, turns on the Step-free toggle, and re-plans any route already shown.

A floor request ("go to the 2nd floor", "take me to level 3", "upstairs", "top floor") is resolved by `matchFloor` against the building's floor names and routed with `routeToFloor`, which finds the shortest permitted route from the visitor's checkpoint to any stairs or elevator landing on that floor (elevators only when step-free is on). The chat reports which connection to take and the distance, and offers a button that draws the route; the search box plans it directly. Asking for a floor the building does not have lists the floors it does have. The model is told to express floor requests as a search for "floor N" so that paraphrases reach the same handler.

"Where is the elevator?", "nearest escalator", or "find the stairs" route to the nearest landing of that kind on the visitor's floor (`routeToConnection`), falling back to any floor; the chat names the landing and distance and offers a route button, and the search box plans it directly. The demo graphs model vertical connections as `stairs` and `elevator` edges only, so an escalator request is routed to stairs with a note saying so, and Estancia's single floor reports that it has no mapped connections. Elevator and stairs landings are also drawn as outlined chips on the selected floor of the 3D view; tapping one plans a route to it. Asking where the elevator is does not switch on step-free routing; only phrases such as "use the elevator" or "I can't climb stairs" do.

Factual questions about the building are answered from the package by `src/building-facts.ts`, in both the search box and the chat, without a model call: how many floors or which is the highest, what floor the visitor is on, what is on a given floor, which floor a named place is on (a store on several floors lists them all), whether a place exists, how many places of a kind there are (restaurants, restrooms, stores, elevators), and how far a place is from the checkpoint, with the walk time estimate. Places named in an answer are offered as tappable destinations. A place the names and aliases do not know falls through to the normal semantic search, and a question the model misclassifies as unsupported is still answered when the rules recognise it.

A route between two explicit endpoints ("create a route to first floor to second floor", "how do I get from the food court to the cinema", "directions from here to Samsung") is parsed by `matchRouteRequest`; each endpoint resolves to a floor, a named place, or a landing (`resolveEndpoint`), and `routeBetween` plans it, using whichever stairs or elevator landing on a floor endpoint gives the shortest permitted route. The route card then shows "Route from …" instead of the checkpoint. An unknown start is explained; an unknown destination falls through to the normal search.

Further deterministic behaviour, all covered by `tests/improvements.test.ts`: common Filipino and Taglish words are translated before anything runs (`src/taglish.ts`: "saan ang cr" becomes "where is the restroom"); a model "choose" is only accepted when the message names an ordinal, a number, or an offered place, otherwise it becomes a search, so "coffee then restroom" never selects a stale suggestion; "which is closer, A or B" compares walking distances; "what shops are near the entrance" lists the closest places by walking distance; "show me everything on this floor" lists the current floor; "nearest restroom on floor 7" limits suggestions to that floor and says so when nothing matches there; "where is the exit" and "take me back to the entrance" route to the entrance node; fire, smoke, and earthquake open the evacuation guide; "thanks", "ok", and "cancel" are acknowledged without a search; amenities a map does not model (wifi, parking, ATM, lockers, nursing rooms) get an honest "no mapped …" reply instead of a random shop; and suggestions are one per place name, nearest floor first.

The conversation keeps the destination query and step-free preference. Nearest results are ordered by permitted graph distance among matching destinations, never by vector similarity or straight-line distance. Distances use the demo starting point or last scanned checkpoint. Without a checkpoint, the assistant requests a scan and supplies no distance. Selecting a result recalculates the route against the current checkpoint and session block reports.

The interface presents candidates for confirmation, filters low-scoring semantic matches, rejects malformed model output, and clears context when switching buildings. Similarity cutoffs are heuristics, not calibrated confidence. A model can still misinterpret a request; destination confirmation and visible routing preferences remain necessary.

Deterministic guardrails in `src/query-guard.ts` run before the model in both the search box and the chat. A whole-message request such as "go to Waypoint Tower" or "switch to Estancia" opens that bundled demo building instead of searching the current map (store names that merely contain a building name, like "Robinsons Appliances", are not treated as a switch). Personal questions, small talk, questions about the assistant, general knowledge, math, time, weather, prompt-injection attempts, and store information such as opening hours or prices are declined with a short explanation and never become a destination search. The same relevance rule used by the chat applies to the search box, so an unrelated query shows "no match" instead of three random rooms. Because absolute similarity varies by building (the correct cinema scores 0.31 in one mall and 0.21 in another), a candidate counts when it is strong on its own (0.35 or more) or clearly stands out from every other room in that building (z-score 2.6 or more over all rooms, with a 0.18 floor); runners-up must stay within 0.12 of the best. Weak-but-standout results are captioned "closest matches" so the visitor checks the name.

Product and need requests are expanded before embedding by `src/needs.ts`: "I want to buy diapers" becomes the query plus "supermarket grocery store drugstore pharmacy department store baby products", and rooms whose name, aliases, or category identify such a place (supermarket, grocer, drug, pharmacy, department, retail) receive a 0.1 boost. The boost is lexical rather than per category so that a mall without a suitable store does not promote unrelated shops. Rules cover baby products, snacks and drinks (food courts, cafés, and bakeries count, so a demo without a supermarket still answers), groceries, medicine, clothing, electronics, home goods, eyewear, beauty, books and stationery, toys, sports gear, money services, grooming, food, cinema, and assistance; the model prompt asks the interpreter to add the kind of store to product queries as well. Both paths are covered by the real-model relevance tests. The thresholds were calibrated against all four demo packages with `onnxruntime-node`; they remain heuristics, not calibrated confidence. The model prompt and `check:chat` cover the same categories for paraphrases the rules do not catch.

If the interpreter cannot load, the interface explicitly switches to limited local destination search. Unknown places can return no match. Opening hours, prices, crowds, and general questions are outside scope. Evacuation requests open the existing separately labelled demo guide. All map accuracy limitations still apply.

## Provisioning and builds

From the repository root:

```sh
npm ci
npm run setup
npm run setup:chat
npm run build
cd mobile
npm ci
npm run check
```

`setup:chat` downloads the interpreter only during development, verifies its SHA-256, and supports interrupted-download recovery. The file lives in `.local/chat/`, outside the browser's public assets. Only one setup process may run at a time. A killed setup can leave a `.lock` file: confirm that no downloader is running before removing that lock and retrying. Failed checksums are never bundled.

`npm run build` verifies the interpreter checksum. Metro, which bundles the app's JavaScript and assets, reads every required asset into a string and fails above roughly 500 MB, so the 1.1 GB Qwen3-1.7B file cannot be embedded in the APK (the earlier 639 MB model could not either). Instead, install the app, launch it once, connect the phone over USB with debugging enabled, and run `npm run chat:sideload`, which pushes the file to the app's own external folder with adb; the app checks that folder first on every launch. A model under 480 MB would still be bundled automatically. Without the file the app says so in the chat and falls back to limited search. Generated weights are ignored by Git.

Adding `llama.rn` requires rebuilding the native app. Expo Go cannot load this native runtime. Use the project's iOS signing/build procedure on a Mac or an appropriately configured EAS build. The `llama.rn` postinstall downloads prebuilt native libraries (Android `jniLibs` for arm64-v8a and x86_64, and the iOS xcframework) from its GitHub release; without them Gradle still succeeds, but the APK contains no `librnllama*.so` and the app falls back to limited search. On Windows that download fails silently inside Git Bash because GNU `tar` misreads `C:\` paths, so `mobile/scripts/ensure-llama-artifacts.mjs` runs after install and retries with the Windows `tar`. Also on Windows, the release variant compiles llama.rn's JNI wrapper under paths longer than 260 characters when the repository sits in a deep folder such as OneDrive, and ninja fails with "mkdir … No such file or directory"; `mobile/scripts/patch-llama.mjs` points that native build at a short staging directory under `%LOCALAPPDATA%`, and the config plugin `mobile/plugins/with-short-native-paths.cjs` tells the app's own autolinked CMake build to hash object paths beyond 180 characters (`CMAKE_OBJECT_PATH_MAX`). A source-validation install may set `RNLLAMA_SKIP_POSTINSTALL=1`, but a device build must have the artifacts. This does not provision a signing certificate or install an app on an iPhone.

The Android emulator runs a debug build by default (`npx expo run:android`), where Metro serves the JavaScript and streams the 1.1 GB model asset to the device on first use. For the offline acceptance test use a release build (`npx expo run:android --variant release` or the Gradle steps in the README), which embeds the model in the APK.

## Browser development

The browser continues to run MiniLM through local WASM. For interpreter development, install [llama.cpp](https://github.com/ggml-org/llama.cpp), then use two terminals:

```sh
npm run chat:server
npm run dev
```

The helper starts `llama-server` on `127.0.0.1:8082` with the same GGUF. Set `WAYPOINT_LLAMA_SERVER` to the executable path if it is not on PATH, and `WAYPOINT_CHAT_PORT` to run a second instance for model comparison; `check:chat` reads `WAYPOINT_CHAT_URL` (default `http://127.0.0.1:8082`) to evaluate that instance. Open the browser preview on localhost. The Vite proxy points only to the loopback runtime; the client disables this interpreter path when opened through a remote hostname. The installed iPhone app always invokes its native runtime instead. Browser production previews without this development proxy retain limited local destination search.

## Verification

```sh
npm test
npm run typecheck
npm run check --prefix mobile
npm run check:chat
```

`check:chat` requires the local interpreter server and tests real-model intent extraction separately from deterministic routing. It writes `.cache/chat-evaluation.json`, including actual output and elapsed desktop time. It is a small regression suite, not a comprehensive benchmark or an iPhone speed test.

Before presenting, install a signed Release build on the iPhone 13 with every asset included. Disable Wi-Fi and cellular data **before the first launch**. Verify a paraphrased destination request, a step-free follow-up, a numbered selection, a missing destination, cancellation, switching buildings, background/resume, and a checkpoint scan. Measure first-answer and warm-answer latency, peak memory while the 3D map is visible, and repeated-turn stability. If the phone struggles, retain the limited search mode while evaluating a smaller quantization; do not claim unmeasured device performance.

## Hackathon disclosure

Disclose Qwen3-1.7B Q4_K_M, MiniLM, llama.rn/llama.cpp, ONNX Runtime, Expo/React Native, Three.js, all existing models/assets/code, and AI-assisted development tools. Both interpretation and retrieval execute on the installed device. Development downloads and app provisioning need internet; an installed, fully bundled Release app does not need internet for navigation chat. The building LAN is used only for map-package updates.

References: [Qwen model card](https://huggingface.co/Qwen/Qwen3-1.7B), [pinned model artifact](https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/blob/bd59ef4/Qwen3-1.7B-Q4_K_M.gguf), [llama.rn](https://github.com/mybigday/llama.rn), and the participant briefing pages 6, 9, 14, 16, and 25.
