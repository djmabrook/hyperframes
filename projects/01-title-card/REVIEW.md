# Review · 01 title card

Reviewed 2026-10-25 with HyperFrames plugin 0.8.198.

## Structural and runtime (`check --json`)

`ok: true`. Lint 0/0 across 2 files; runtime 0 errors; layout 0 findings over 9 samples; contrast
42/42 passed over 5 samples; craft 0 findings over 64 samples.

Fixed along the way:

| Finding | Cause | Fix |
| --- | --- | --- |
| `nested_structure_needs_subcomposition` (lint warning) | Title block and strip were timed elements with children in the root | Moved everything into the `title` scene file; root holds only the host |
| `request_failed` + `page_error` (runtime) | Headless Chrome could not load GSAP from jsDelivr through the sandbox proxy | Vendored GSAP 3.14.2 to `assets/vendor/` |
| `first_frame_empty` (craft warning) | Kicker and strip faded in, so frame 0 was bare ground | Kicker and strip are on screen from frame 0 |

## Visual

Snapshots at 0, 0.5, 0.85, 1.2, 1.7, 2.3, 4, 7.9 and 7.76 s ([contact sheet](review/contact-sheet.jpg)).
Fonts resolved (Inter 900/400, JetBrains Mono 700); no fallback faces, clipping or overlap. The
headline lands by 1.2 s and the subline by 2.3 s; from 2.3 s to the end only the frame strip and
timecode change. The snapshots were taken out of order (7.9 s before 7.76 s) and every timecode
matches its seek time.

Minor note: the gap after "frame," reads slightly wide at 150 px. Left as is; it separates the
accent phrase.

## Delivery (`renders/title-card.mp4`, quality `looks`)

ffprobe: H.264 High, yuv420p, 1920×1080, 30/1 fps, duration 8.000000 s, 240 frames (counted by
decoding), 197.6 KB, no audio stream (intended). Rendered in 16.1 s (beginframe capture, software
GPU).

Decoded frames from the MP4 at 0, 1.0, 2.4 and 7.95 s show timecodes 00:00:00:00, 00:00:01:00,
00:00:02:12 and 00:00:07:29, which is exactly frame-accurate, with 7:29 the last frame (239)
([decoded frames](review/decoded-render-frames.png)).

## Not checked

Phone-size readability, and playback on specific social platforms.
