# Waypoint mascot animation

Remotion prototype using the existing `public/mascot/waypoint-cat.png` master image. The cat blinks twice, gently breathes, and sways its tail in a five-second loop at 30 fps. SVG masks animate parts of the original PNG without repainting it.

Run commands from this directory:

```sh
npm ci
npm run studio
npm run typecheck
npm run render
npm run render:transparent
npm run render:play-dead
npm run render:play-dead:transparent
```

The MP4 has a white background for preview. The WebM uses VP9 with an alpha channel for overlay use. Outputs are saved to `output/mascot/` at the project root. If a system Chrome is needed, add `--browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` after `--` in the render command.

The idle compositions use the same frame-driven animation. Their start and end states form a continuous idle cycle. `CatPlayDead` and `CatPlayDeadTransparent` are six-second one-shot actions: the cat leans, flops onto its side, closes its eyes, and rests. They finish lying down and should be played once rather than looped. Both actions share the image and masks in `CatIdle.tsx`. No app screens or runtime dependencies have been changed.

The local image in `public/waypoint-cat.png` is a copy of the master asset; update that copy when changing the mascot. The eye and tail masks are fitted to the current 1254 × 1254 image and should be updated if its geometry changes.

References: [Remotion fundamentals](https://www.remotion.dev/docs/the-fundamentals), [transparent exports](https://www.remotion.dev/docs/transparent-videos).
