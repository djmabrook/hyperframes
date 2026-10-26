// The clip bin: one list per tab, in the order they appear. A clip needs a title and a video;
// note (a short line under the title), poster (a still for the thumbnail) and colour (its
// label chip) are optional.
// PLACEHOLDER: every clip plays the same placeholder video until the real ones are added.
const video = "media/placeholder.mp4";
const poster = "media/placeholder-poster.jpg";

export const CLIPS = {
  documentary: [
    { title: "Rajie Cook Documentary", note: "Recent work", video, poster, colour: "#f2a541", placeholder: false },
    { title: "Placeholder 02", video, poster, colour: "#9b8ad6" },
    { title: "Placeholder 03", video, poster, colour: "#5a7be0" },
    { title: "Placeholder 04", video, poster, colour: "#22b3a5" },
    { title: "Placeholder 05", video, poster, colour: "#c79fe0" },
    { title: "Placeholder 06", video, poster, colour: "#2e9be6" },
  ],
  commercial: [
    { title: "Placeholder 01", video, poster, colour: "#4c9a4c" },
    { title: "Placeholder 02", video, poster, colour: "#e06a9a" },
    { title: "Placeholder 03", video, poster, colour: "#e6d84a" },
    { title: "Placeholder 04", video, poster, colour: "#e04a4a" },
    { title: "Placeholder 05", video, poster, colour: "#f27a41" },
    { title: "Placeholder 06", video, poster, colour: "#6fb7d9" },
  ],
};
