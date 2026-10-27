"""Build the CRT alpha overlays from the 4K Trinitron photograph.

Usage: python3 make_overlays.py /path/to/06-sony-tv-4k.png OUT_DIR

Every PNG is 1560x1080: the photographed glass (aspect 1.444) at 1080 lines.
To use them in an editor, center-cut a 1920x1080 picture to 1560x1080 and
stack the layers on top in the order listed in crt/README.md.
The glass geometry matches GLASS in motion/landing/crt/crt-screen.js.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
# Glass in the 1920x1080 tv-shot space (the photo is 3840x2160, so x2).
CX, CY, HW, HH, R, BOW = 960, 496, 254, 176, 26, 4
OW, OH = 1560, 1080
k = OH / (2 * HH)  # output px per tv-shot px

ys, xs = np.mgrid[0:OH, 0:OW].astype(np.float64)
px = (xs + 0.5 - OW / 2) / k
py = (ys + 0.5 - OH / 2) / k


def glass_sdf(px, py):
    """Rounded box whose edges bow outward by BOW at their midpoints."""
    bx = HW + BOW * (1 - np.clip(py / HH, -1, 1) ** 2)
    by = HH + BOW * (1 - np.clip(px / HW, -1, 1) ** 2)
    ex = np.abs(px) - (bx - R)
    ey = np.abs(py) - (by - R)
    out = np.hypot(np.maximum(ex, 0), np.maximum(ey, 0))
    return out + np.minimum(np.maximum(ex, ey), 0) - R


sd = glass_sdf(px, py)
# 1.5 tv-shot px of feather: the glass meets the bezel recess softly.
mask = np.clip(0.5 - sd / 1.5, 0, 1)


def save(name, rgb, alpha):
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    c = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(np.dstack([c, a]), "RGBA").save(f"{OUT}/{name}", optimize=True)


ones = np.ones((OH, OW, 3))

# 1. glass-mask: white inside the glass, transparent outside.
save("glass-mask.png", ones, mask)

# 2. glass-surface: the photographed glass itself (room reflection, dust,
#    window). The shader screen-blends this over the emitted picture.
photo = Image.open(SRC).convert("RGB")
crop_box = (
    round((CX - OW / 2 / k) * 2),
    round((CY - OH / 2 / k) * 2),
    round((CX + OW / 2 / k) * 2),
    round((CY + OH / 2 / k) * 2),
)
glass = np.asarray(photo.crop(crop_box).resize((OW, OH), Image.LANCZOS)) / 255.0
save("glass-surface.png", glass, mask)

# 3. glass-reflection: only what is brighter than the dark glass floor
#    (the window, the ceiling glow, specks). Normal blend, white-ish light.
lum = glass @ np.array([0.2126, 0.7152, 0.0722])
floor = np.percentile(lum[mask > 0.9], 35)
refl = np.clip((lum - floor) / (lum.max() - floor), 0, 1) ** 0.9
soft = np.asarray(Image.fromarray((refl * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.0
save("glass-reflection.png", np.clip(glass * 1.6, 0, 1), soft * mask * 0.85)

# 4. vignette: black, opaque toward the curved edges of the tube.
nx, ny = px / HW, py / HH
r2 = nx * nx * 0.9 + ny * ny
vig = np.clip((r2 - 0.35) / 1.1, 0, 1) ** 1.6 * 0.75
edge = np.clip(1 + sd / 18, 0, 1) ** 2 * 0.6  # darker within ~18px of the bezel
save("vignette.png", np.zeros((OH, OW, 3)), np.maximum(vig, edge) * mask)

# 5. scanlines: 2-px period at 1080 lines (an interlaced 525-line look).
line = 0.5 - 0.5 * np.cos((ys + 0.5) / 2.0 * 2 * np.pi)
save("scanlines.png", np.zeros((OH, OW, 3)), line * 0.28 * mask)

# 6. aperture-grille: Trinitron vertical RGB stripes, for a multiply/overlay pass.
phase = (xs.astype(int) % 3)
grille = np.zeros((OH, OW, 3))
for c in range(3):
    grille[..., c] = np.where(phase == c, 1.0, 0.35)
save("aperture-grille.png", grille, 0.18 * mask)
print("ok", crop_box)
