# Proxy Media site

Static site, no build step. Serve this folder as the site root.

- `index.html` is the landing page. Scrolling seeks the HyperFrames composition in
  `motion/landing/` through `<hyperframes-player>`, forward on the way down and backward on the
  way up. Film grain and the warm falloff are drawn live on the page.
- `motion/landing/index.html` is the composition (1920 x 1080, 12 s, GSAP timeline registered as
  `main`). It can also be rendered to video with the HyperFrames CLI as a fallback.
- `motion/landing/assets/img/` holds the layers cut from Mohamed's seven 4K reference frames
  (`proxy-media-4k-collection.zip` in the project files; frame 2 is not used). `assets/source/prep_layers.py` is the
  script that cut them: tape cutouts and shadows, the wall under the tape rebuilt from frame 1,
  and the registration of each frame onto the next.
- `#tv-content` in the composition is the empty placeholder inside the TV screen where the rest
  of the site will go (TBA).
