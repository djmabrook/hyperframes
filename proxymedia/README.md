# Proxy Media

Static website; serve `proxymedia/` as the document root. No build step or runtime network dependency.

The landing animation is a 14-second seekable Hyperframes composition. Scrolling samples one paused GSAP timeline at fractional seconds; it runs forward and backward. `scroll.js` applies time-correct damping, waits for the composition images/model, handles resized/restored pages, and stops requesting frames at rest. Reduced-motion users get direct scroll positioning without the trailing motion.

## Sequence

- 0–0.7 s: cassette against the wall and pencil inscription.
- 0.7–5.1 s: a single Meshy VHS model descends and rotates toward the VCR as the camera follows. Its width and leading cross-section are aligned to the measured slot aperture.
- 5.55–7.35 s: the same tape slides into the slot. A model-space clipping plane removes only the depth already inside; the visible cross-section remains centered in the aperture.
- 7.35–7.8 s: the slot flap closes; only its image patch changes.
- 8–10.8 s: the camera moves continuously down to the Sony TV.
- 10.65–13.7 s: a continuous punch into that same TV photograph, with no close-up image handoff.
- 13.7–14 s: hold on the screen. The empty `#site-content` element in the parent page is the future accessible, interactive site surface; its pointer events are enabled at completion. No placeholder copy is shown.

`motion/landing/scene.js` contains deterministic `stateAt(time)` and `renderAt(time)` functions. The timeline is registered as `window.__timelines.main`; `hf-seek` is supported for Hyperframes rendering. All geometry is derived from time, so arbitrary seek order produces the same pose. `scene.css` places the photographed wall, VCR, and TV in one vertical world instead of rotating between separate walls.

## Assets and performance

`assets/model/proxy-vhs.glb` was generated privately in Meshy 7.1 from the approved cassette reference, remeshed to 7,528 triangles / 8,750 vertices. It retains a 4096px color map; normal and material maps are 2048px. JPEG textures bring the GLB to approximately 6.6 MB from a 39.8 MB master. Three.js 0.170.0 is vendored with its MIT license. No CDN is needed at playback.

`tape-model.js` draws only a 960×640 transparent region around the moving tape and stops drawing after insertion. If WebGL or the model fails, the parent keeps its static poster. The composition contains no 2D tape stand-in or old shadow image, so no white rim or rectangular shadow patch sits behind the 3D model. Grain is one small fixed seeded SVG, replacing a full-viewport noise redraw loop. The photo layers are the existing prepared WebP assets; the older cutouts remain available as source/fallback material.

The pinned Hyperframes player does not expose module-created WebGL assets through `assetsReady` reliably. The host therefore also checks the same-origin composition's image decode state and explicit model initialization result before removing the poster.

## Verification

Desktop 1440×810 and phone 390×844 were exercised in Chrome: asset loading, all sequence phases, forward/reverse scrolling, deterministic repeated seeks, end-screen viewport coverage, and reduced-motion behavior. No uncaught page errors. The model is a generated reconstruction: fine molded details and the hidden back differ from a manufactured VHS. Real hardware still needs an aesthetic/performance review; automated checks cannot guarantee a frame rate on every device.

`tests/insertion.cjs` reads actual WebGL pixels through insertion, checking that the tape intersects the photographed aperture, fits its width, stays behind the upper bezel, disappears progressively, and reproduces the same pixels on reverse seek. It also checks removal of old image layers and the static-poster fallback. Run browser tests with Playwright available, `PROXY_URL` pointing to the served site, and optionally `CHROME_PATH` for an installed Chrome executable.

## After the landing: the wall and the mailbox

The landing sequence lives in `#landing`; its sticky `#stage` lets go at the end, and the sections in `sections/` scroll in below it. `scroll.js` measures the sequence from `#landing`, not the whole page.

- `#notes` (`sections/notes.js`): the project list scrawled in Sharpie straight onto the plaster, lopsided on purpose: "In Development" (AI Psychosis Doc, Bodega Guy Short), "In Production" (Nick County music vid) and "Out Now" (empty). Headers are Sedgwick Ave Display, titles Caveat Brush (both SIL OFL, `sections/media/`), placed glyph by glyph with a sagging baseline, a blot where the tip lands, a feathered bleed into the plaster and pinholes where the tip skipped; the canvases multiply onto the wall. It is written on the first time it comes into view. Visitors write with the pointer, each stroke in a new random Sharpie colour; the paint roller paints over their writing. Nothing is saved. On touch screens the wall scrolls until the Sharpie is uncapped. The tape strands from the unspool hang over this section (their canvas is a fixed layer at z-index 40).
- `#mailbox` (`sections/mailbox.js`): a CSS 3D aluminium mailbox modelled on the reference. Scroll is the target for a set of springs: the middle door swings open, the paper slides out over the lip, tips down and bounces, then lifts to the centre while the box falls back into shade. At rest the paper is a plain 2D element so its inputs are crisp; while a field has focus the paper stays up whatever the page scroll does (phone keyboards scroll the page).
- The paper is a Netlify Form named `contact` (`data-netlify`, honeypot `bot-field`), posted URL-encoded to `/`. Email delivery is a Netlify form notification to mohamed@proxymedia.org, set in the Netlify UI.

`tests/sections.cjs` checks the sections in a browser: strokes reach the ink canvas in three different colours, the roller paints over them, a focused form stays up while the page scrolls, and the submit posts the Netlify fields (the POST is intercepted, so nothing is sent).
