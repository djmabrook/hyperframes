# Checker

An interactive checkerboard landscape. Static files only (no build step); Three.js and MediaPipe are vendored in `vendor/`.

## Playing with it

- **Hover** (mouse): the cloth swells toward your hand and soft notes follow you across the squares.
- **Press and hold**: your hand sinks into the cloth, deeper the longer you hold, with a low swelling tone.
- **Drag**: pulls the cloth with you in 3D; let go and it relaxes back in ripples.
- **Sound**: starts on the first click or tap. The speaker icon mutes.
- **Base tone**: the note icon cycles through the tone bank. Keys `1`–`9` pick a tone, `T` cycles, `?tone=bowl` preselects one. Your own recordings go in `tones/` (see `tones/README.txt`).
- **Head tracking** (desktop): on the first click the browser asks for the camera; moving your head shifts the perspective like a window. The video never leaves the device. The eye icon turns it off. Without a camera, the mouse drives the parallax.
- **Phones**: tilting the phone leans the view (iOS asks for motion permission on the first tap).

The light, sky and sun change on their own, drifting through the three reference moods over about four minutes.

### Debug URL parameters

- `?t=90` start the weather at a given time, `?speed=10` run the weather faster, `?speed=0` freeze it
- `?q=0.5` render at half resolution, `?fixed=1` turn off the automatic resolution step-down
- `?cam=0` skip the head-tracking camera request

## Hosting on Netlify

1. Netlify → **Add new project** → **Import an existing project** → GitHub → `djmabrook/hyperframes`.
2. Branch to deploy: the branch this folder lives on.
3. Base directory: leave empty. Build command: leave empty. **Publish directory: `checker`**.
4. Deploy. The camera and audio need https, which Netlify provides.
