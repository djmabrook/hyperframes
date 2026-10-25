# 01 · Title card (qualification exercise 1: type and timing)

**Ask:** a 6–10 second title piece with a readable final hold.

**Must demonstrate:** reliable seeking, correct duration, no font or visibility surprises.

## Treatment

- 8.0 s, 1920×1080, 30 fps, silent.
- Copy: kicker "HYPERFRAMES · EXERCISE 01", headline "Every frame, on time.", subline
  "Rendered by seeking, never by playing."
- Look: near-black ground `#0e1116`, warm off-white ink `#f2ede4`, one accent `#ff5a36` on the
  meaning-carrying words. Inter 900 headline, Inter 400 subline, JetBrains Mono 700 kicker and
  timecode (all bundled fonts).
- Motion: the kicker and a 30-tick frame strip are on screen at frame 0 (the thumbnail). The
  accent rule draws in on `expo.out`; headline words blur in one at a time with no translate; the
  subline steps from dim to full ink word by word. Everything lands by about 2.3 s, then the titles
  hold dead still for 5.7 s.
- The frame strip and SMPTE-style timecode are driven only by timeline time: the lit tick is the
  current frame within the second. They keep the frame alive during the hold, and they make
  seeking verifiable, because any decoded frame should show its own timestamp.

## Acceptance criteria

1. `check --json` passes with real samples in every audit.
2. Rendered file is 8.000 s, 240 frames, 1920×1080, 30 fps.
3. Decoded frames at arbitrary times show the matching timecode.
4. Final readable hold of at least 2 s.

## Editable

Kicker, headline words and the three colours are variables on the scene
(`compositions/title.html`); the host in `index.html` passes them in `data-variable-values`.
