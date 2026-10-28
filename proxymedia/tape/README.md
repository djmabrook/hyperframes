# Tape unspool

After the TV powers off, VHS tape unspools from above the frame and hangs in front of the set. `tape-ribbons.js` is one ES module on the vendored Three.js (r170). It needs no build step and no baked assets: the tape is simulated live, so it reacts to the mouse or a finger.

## Scroll layout (`index.html`, `scroll.js`)

`#landing` is 1360vh tall and `#stage` is sticky inside it. Invisible markers split the scroll:

| marker | at | what happens |
| --- | --- | --- |
| `#mark-tv` | 800vh | the 14 s camera move ends and the set powers on. This is also the scroll-snap point, so a scroll that stops near the TV settles on it. |
| `#mark-strain` | 850vh | resistance begins. Forward wheel input moves the page at 40%, and the set leans toward you (3.5% on wide screens, 1.2% on phones so the whole-TV framing keeps its wall margin). |
| `#mark-off` | 920vh | the lean lets go and the set powers off: the picture collapses to a line, then a dot, and the dot fades. Scrolling back 24 px above it powers the set on again. |
| `#mark-unspool-end` | 1120vh | the tape is fully unspooled and has fallen past the TV. The camera has held on the TV until now. |
| `#mark-pull-end` | 1260vh | the camera has pulled back out of the punch (the timeline runs back to 10.8 s, so the TV is at its pre-punch size) and lowered 230 composition px (`scene.setDrift`), so the TV has risen up the screen. `#tv-floor` continues the plaster below the TV. The landing ends 100vh later, and the tape keeps hanging over the next section (`#notes`) until that section scrolls away. |

`scroll.js` publishes the framing to the tape as `window.__proxyStage` plus a `proxy-stage` event: `k` (CSS px per TV-photo px), `ox`/`oy` (where the photo's origin sits in the stage), `feed` (0..1) and `active`.

## Simulation

- **Units.** TV-photo pixels (`#tv-shot`, 1920×1080), y down, z toward the viewer. The tape is 22 px wide, which is 12.7 mm on this 13" Trinitron (the glass is 508 px, about 26 cm).
- **Particles.** Each stream is a chain integrated with Verlet at a fixed 60 Hz step, with inextensible links. Air drag is anisotropic: motion across the tape's face is damped far more than motion along it, so the tape drifts like paper.
- **Curl memory.** The rest shape of each stream is integrated from a wandering curvature (the reel radius, 32 to 102 px) and a torsion that drifts and changes sign, so the coil reverses here and there. Overlapping windows of 8 particles are shape-matched to that rest curve on every solver pass (optimal rotation via Müller et al. 2016). This holds loops against gravity without the zigzag crumpling of simple bending springs.
- **Feed.** Each stream comes off an off-screen reel above the frame. Scroll moves particles along a coiled guide past the anchor, where they are let go. The rate is capped at 0.7 of the length per second, so a flung scroll still reads as tape falling. Scrolling back reels the tape in.
- **Contact.** Particles collide through a spatial hash, within a strand and across strands, so loops catch and tangle. The wall and TV front are a plane the tape stays in front of.
- **Pointer.** The mouse or finger is a capsule along the view ray. It pushes the tape out of the way and passes on the hand's velocity. Touch follows `touchmove`, so it works while the finger scrolls.

## Look

- The ribbon is Catmull-Rom smoothed. Its width follows the curve's binormal, because tape bends across its width and never in its own plane.
- There are two sides: matte brown-black oxide and glossy black backing with a clearcoat.
- Light matches the photograph: a warm key from the upper left and front (the TV's own shadow falls down and right), a warm hemisphere fill, and a small generated room environment with the window on the left for reflections.
- A shadow catcher on the wall plane takes only the tape's shadows, tinted warm like the TV's.
- The canvas sits under the page vignette and film grain, so the tape gets the same grain.

## Tunables (top of `tape-ribbons.js`)

`TAPE_WIDTH`, `GRAVITY` (650 px/s²), `FEED_RATE`, `WINDOW`, `CURL`, `POINTER_RADIUS`, and the quality table `Q`: streams, particles per stream, solver passes, shadow-map size, pixel ratio and smoothing. Phones get 4 streams of up to 64 particles; desktops get 6 of up to 110. `window.__proxyTape` exposes `feed`, `state` and `quality` for debugging.

## Program video (`motion/landing/crt/crt-screen.js`)

`PROGRAM_SRC` at the top of the file is the video that plays on the TV after 3 s of the blue "by proxy" screen, with a short burst of tape-tracking noise as it switches. It is `null` until Mohamed's file is in, so the blue screen keeps looping. To swap the video in, put the MP4 in `motion/landing/assets/crt/` and set `PROGRAM_SRC = "assets/crt/program.mp4"`. The video plays muted, since browsers only autoplay muted video.
