# HyperFrames video projects

Video and animation projects built with [HyperFrames](https://github.com/heygen-com/hyperframes)
(HTML compositions rendered to video by seeking a paused timeline frame by frame), authored with
Claude Code.

## Install route

**HyperFrames is installed as the Claude Code plugin, not the standalone `npx` CLI.** Use one route
only: the plugin owns its own skills and pins the CLI version, so don't run `npx hyperframes`,
`hyperframes skills update` or `npx skills add` alongside it.

```bash
claude plugin marketplace add heygen-com/hyperframes
claude plugin install hyperframes@hyperframes
claude plugin details hyperframes          # expect 7 skills
```

All CLI calls go through the plugin's bundled launcher, wrapped here as [`bin/hf`](bin/hf):

```bash
cd projects/<name>
../../bin/hf doctor --json                 # gate on .ok, not the exit code
../../bin/hf browser ensure                # first run: downloads Chrome Headless Shell
```

`bin/hf` defaults to plugin release `0.8.198`; override with `HF_PLUGIN_VERSION` (or
`HF_PLUGIN_ROOT`) after a plugin update, and record the new version below.

## Verified environment

Recorded 2026-10-25 on the Linux cloud container used to set this repo up.

| Component | Version | Notes |
| --- | --- | --- |
| HyperFrames plugin | 0.8.198 | 7 skills: hyperframes, hyperframes-cli, hyperframes-registry, media-use, figma, remotion-to-hyperframes, slideshow |
| HyperFrames CLI (via launcher) | 0.8.198 | |
| Claude Code | 2.1.310 | |
| Node.js | 22.22.0 | 22+ required |
| FFmpeg / FFprobe | 6.1.1 | |
| Chrome Headless Shell | 152.0.7977.30 | installed by `hf browser ensure` |
| GSAP | 3.14.2 | vendored per project in `assets/vendor/` |

`doctor --json` reports `ok: false` on this machine only because of optional or unused checks:
whisper-cpp (transcription), Kokoro (local TTS), MusicGen (local music) and Docker (only for
`render --docker`). Everything needed for local rendering passes. Install the first three when a
project needs captions, voice or generated music.

## Layout

```
bin/hf                     plugin launcher wrapper
projects/NN-name/          one HyperFrames project per folder
  index.html               root composition: variables, scene hosts, audio
  compositions/            one scene per file
  assets/                  fonts, images, media, vendored scripts
  BRIEF.md                 what was asked and the acceptance criteria
  REVIEW.md                what was checked, measured and fixed
  review/                  small review images kept as evidence
```

Renders go to each project's `renders/` folder, which git ignores along with other large media and
the `.hyperframes/` machine state. Deliver renders through the PR or the project thread.

## Production loop

From inside a project folder:

```bash
../../bin/hf lint                                   # while writing
../../bin/hf check --json                           # the gate: lint, runtime, layout, contrast, craft
../../bin/hf snapshot --at 0,1.5,4                  # PNGs in .hyperframes/artifacts/snapshots/; look at them
../../bin/hf preview --background                   # Studio preview for review
../../bin/hf render --quality looks --output renders/<name>.mp4
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate,nb_frames renders/<name>.mp4
```

A check with "0 samples" checked nothing. A render is verified only when its ffprobe duration
matches the root `data-duration` and decoded frames have been looked at.

### Gotcha: keep scripts and assets local

Headless Chrome on the cloud container cannot reach CDNs through the sandbox proxy, so a
`<script src="https://cdn.jsdelivr.net/...">` fails `check` with `request_failed`. Vendor
libraries into `assets/vendor/` (the brief asks for locally resolvable assets anyway). Bundled
fonts (Inter, JetBrains Mono and the rest listed in the plugin's `references/format.md`) resolve by
name.

## Qualification exercises

| # | Exercise | Project | Status |
| --- | --- | --- | --- |
| 1 | Type and timing | [`projects/01-title-card`](projects/01-title-card) | Rendered and inspected |
| 2 | Product truth | | |
| 3 | Explanation | | |
| 4 | Speech and captions | | |
| 5 | Data | | |
| 6 | Character | | |
| 7 | Procedural or 3D | | |
| 8 | Multi-format delivery | | |
| 9 | Reuse and alpha | | |
| 10 | Recovery | | |
