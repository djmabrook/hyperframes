// The clip bin: one list per tab, in the order they appear. A clip needs a title and a video;
// poster (a still for the thumbnail), colour (its label chip) and the tab's column fields are
// optional. Set placeholder: false once a clip's details are real.
// PLACEHOLDER: a clip without its own video plays the Media Offline card. Sugaring has its own
// card, offline-contact, reading "Contact for Samples".
const video = "media/offline.mp4";
const poster = "media/offline.jpg";

// Tabs listed here show as a list view with these columns: [field, heading].
export const COLUMNS = {
  documentary: [
    ["title", "Name"],
    ["year", "Year"],
    ["episodes", "Episodes"],
    ["format", "Format"],
    ["credit", "Credit"],
  ],
};

export const CLIPS = {
  documentary: [
    { title: "Untitled Rajie Cook Documentary", year: "2024–2026", format: "Feature Documentary", credit: "Editor", video: "media/doc-rajie-cook.mp4", poster: "media/doc-rajie-cook.jpg", colour: "#f2a541", placeholder: false },
    { title: "Shaun White: The Last Run", year: "2022–2023", episodes: "4", format: "HBO Max Docu-series", credit: "Editor", video: "media/doc-shaun-white.mp4", poster: "media/doc-shaun-white.jpg", colour: "#9b8ad6", placeholder: false },
    { title: "Sugaring", year: "2021–2023", episodes: "4", format: "Showtime Docu-series", credit: "Editor", video: "media/offline-contact.mp4", poster: "media/offline-contact.jpg", colour: "#5a7be0", placeholder: false },
    { title: "Badass Librarians of Timbuktu", year: "2021–2022", format: "Feature Documentary", credit: "Editor", video: "media/doc-badass-librarians.mp4", poster: "media/doc-badass-librarians.jpg", colour: "#22b3a5", placeholder: false },
    { title: "Marianne", year: "2019–2021", format: "Feature Documentary", credit: "Editor", video: "media/doc-marianne.mp4", poster: "media/doc-marianne.jpg", colour: "#c79fe0", placeholder: false },
    { title: "Unnatural Selection", year: "2018–2020", episodes: "4", format: "Netflix Docu-series", credit: "Editor", video: "media/doc-unnatural-selection.mp4", poster: "media/doc-unnatural-selection.jpg", colour: "#2e9be6", placeholder: false },
    { title: "For Ahkeem", year: "2014–2016", format: "Feature Documentary", credit: "Post Production Supervisor", video: "media/doc-for-ahkeem.mp4", poster: "media/doc-for-ahkeem.jpg", colour: "#4c9a4c", placeholder: false },
  ],
  commercial: [
    { title: "Signal", video: "media/com-06.mp4", poster: "media/com-06.jpg", colour: "#6fb7d9", placeholder: false },
    { title: "Heineken", video: "media/com-02.mp4", poster: "media/com-02.jpg", colour: "#e06a9a", placeholder: false },
    { title: "Blue Bird Bio", video: "media/com-03.mp4", poster: "media/com-03.jpg", colour: "#e6d84a", placeholder: false },
    { title: "Seamless", video: "media/com-04.mp4", poster: "media/com-04.jpg", colour: "#e04a4a", placeholder: false },
    { title: "NYC Public Schools", video: "media/com-05.mp4", poster: "media/com-05.jpg", colour: "#f27a41", placeholder: false },
    { title: "NYC Public Schools", video: "media/com-07.mp4", poster: "media/com-07.jpg", colour: "#f27a41", placeholder: false },
    { title: "NYC Public Schools", video: "media/com-08.mp4", poster: "media/com-08.jpg", colour: "#f27a41", placeholder: false },
    { title: "Mirror Launch", video: "media/com-01.mp4", poster: "media/com-01.jpg", colour: "#4c9a4c", placeholder: false },
  ],
};
