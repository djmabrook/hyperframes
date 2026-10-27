// On/off switches for the workspace's interactive motion. Set one to false to turn that
// feature off; nothing else needs to change. Each feature's code is marked with its name.
// To compare in the browser without editing, add ?off=scrub,grade (any names, comma separated).
export const FEATURES = {
  scrub: true, // drag along the timeline to scrub the monitor
  grade: true, // drag a colour wheel's puck to grade the monitor, gently
  lowerThird: true, // the name builds on like a lower third, and replays on hover
  binPreviews: false, // hovering a clip in the bin cues it on the monitor (the hero covers it now)
  liveScopes: true, // the parade on the colour page reads the monitor picture
  clipViewer: true, // clicking a clip in the bin plays it on the smaller monitor on the right
};

const off = new URLSearchParams(location.search).get("off");
if (off) for (const name of off.split(",")) if (name in FEATURES) FEATURES[name] = false;
