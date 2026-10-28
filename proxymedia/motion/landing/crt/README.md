# CRT screen

`crt-screen.js` turns the photographed Sony Trinitron into a working tube. When the scroll punch-in lands on the glass, the set powers on (`assets/crt/tv-on.mp4`), then holds the VCR blue screen (`assets/crt/blue-screen.mp4`, looping). Scrolling back out collapses the raster to a line and a dot and the glass returns to the photograph.

It is one self-contained file: plain WebGL 1, no Three.js, no build step.

## How it works

- **Placement.** A canvas sized to the glass (plus a 10 px margin) is appended inside `#tv-shot`, so every camera move in `scene.js` carries it along with the photograph. There is no separate tracking.
- **Glass shape.** `glassSdf()` is a rounded box whose straight edges bow outward by 4 px at the middle. It is measured on the 4K source (`06-sony-tv-4k.png`) and matches `crt-assets/overlays/make_overlays.py`. Outside the glass the canvas is transparent.
- **Bulbous glass.** Each glass pixel is barrel-mapped to a raster position: `r = n * (1 + curvature * |n|²/2) * overscan`. With `overscan < 1` the raster overfills the edge midpoints but misses the extreme corners, giving the rounded, pillowed picture edge of a real tube.
- **Picture.** The 16:9 video is center-cut to the glass aspect (about 1.44:1, as a 4:3 set shows a 16:9 signal). The "by proxy" OSD sits inside that cut. Red and blue are sampled with a misconvergence offset that grows toward the corners. Focus softens toward the edges, and a ring of wide taps adds bloom.
- **Phosphor.** Scanlines are computed in raster space, so they curve with the picture. The line count adapts to the on-screen size (about 3.2 device px per line, 160 to 480 lines) to avoid moiré. The Trinitron aperture grille (vertical RGB stripes on device pixels) only fades in when the glass is more than about 1200 device px wide.
- **Tube.** Vignette, a darker strip just inside the bezel, per-frame flicker and fine noise.
- **Glass on top.** `assets/crt/overlays/glass-surface.png` (the real glass from the photograph: window reflection, ceiling glow, dust) is screen-blended over the emitted light, minus a little of its grey floor where the tube is lit. When the picture is black the result is exactly the photograph, so power-on and power-off have no visible seam.
- **Power-off.** `uOff` goes from 0 to 1 over 1 s. The raster squeezes vertically to a line (270 ms), then horizontally to a dot, burning white-hot with a bloom on the glass; the dot's afterglow then shrinks and fades.
- **Program.** `PROGRAM_SRC` (top of the file) is the video that follows 3 s of blue screen, entered through a burst of tape-tracking noise (`uTrack`). `null` keeps the blue screen looping. `setProgram(src)` swaps it at runtime.
- **Reduced motion.** With `prefers-reduced-motion`, the flash is skipped and the set opens on the blue screen.

## Parameters (`PARAMS` at the top of the file)

| name | default | what it does |
| --- | --- | --- |
| curvature | 0.12 | barrel strength, how far the picture bows |
| overscan | 0.935 | raster scale; lower overfills the glass more, higher shows more rounded raster corners |
| rasterEdge | 0.018 | softness of the raster edge |
| convergence | 0.0016 | R/B misconvergence at the corners |
| edgeBlur | 2.2 | extra horizontal blur toward the edges, in video px |
| bloom | 0.32 | halo around bright areas |
| scanlines | 0.22 | scanline darkness |
| grille | 0.08 | aperture-grille stripe strength |
| vignette | 0.38 | edge falloff |
| flicker | 0.012 | frame-to-frame brightness wobble |
| noise | 0.018 | tube noise |
| reflection | 1.0 | how much of the photographed glass sits on top |
| glassFloor | 0.12 | grey taken out of the glass where the tube is lit, so the picture keeps its saturation |
| glow | 1.08 | phosphor gain |

They can be changed live from the console of the composition frame: `__proxyCRT.params.curvature = 0.2`.

## API

`window.__proxyCRT` inside the composition iframe: `powerOn()`, `powerOff()`, `setProgram(src)`, `setViewScale(cssPxPerCompositionPx × devicePixelRatio)` and `state` (`off`, `on` or `collapsing`). `proxymedia/scroll.js` calls these. The set turns on at composition time 13.7 s, when the punch lands, and turns off below 13.55 s, or when the scroll passes `#mark-off` (see `../../../tape/README.md`).

## Assets

- `../crt-assets/tv-on/` and `../crt-assets/blue-screen/` are the HyperFrames compositions for the two videos (seekable GSAP timelines, deterministic per frame). Render them with `node ../crt-assets/render.cjs <dir> <out.mp4>`, or with `hf render` where the HyperFrames CLI is installed.
- `../crt-assets/overlays/make_overlays.py` builds the alpha PNGs in `assets/crt/overlays/` from the 4K photograph. Only `glass-surface.png` is read at runtime; the shader computes the rest. The others are there for compositing the same look in an editor: center-cut 1920×1080 to 1560×1080, then stack `scanlines`, `aperture-grille` (overlay), `vignette`, `glass-reflection`, and finally `glass-mask` as a track matte.
