// The clip bin: one list per tab, in the order they appear. A clip needs a title and a video;
// poster (a still for the thumbnail), colour (its label chip) and the tab's column fields are
// optional. Set placeholder: false once a clip's details are real.
// PLACEHOLDER: every clip plays the Media Offline card until its real video is added.
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
    { title: "Untitled Rajie Cook Documentary", year: "2024–2026", format: "Feature Documentary", credit: "Editor", video, poster, colour: "#f2a541", placeholder: false },
    { title: "Shawn White: The Last Run", year: "2022–2023", episodes: "4", format: "HBO Max Docu-series", credit: "Editor", video, poster, colour: "#9b8ad6", placeholder: false },
    { title: "Sugaring", year: "2021–2023", episodes: "4", format: "Showtime Docu-series", credit: "Editor", video, poster, colour: "#5a7be0", placeholder: false },
    { title: "Badass Librarians of Timbuktu", year: "2021–2022", format: "Feature Documentary", credit: "Editor", video, poster, colour: "#22b3a5", placeholder: false },
    { title: "Marianne", year: "2019–2021", format: "Feature Documentary", credit: "Editor", video, poster, colour: "#c79fe0", placeholder: false },
    { title: "Unnatural Selection", year: "2018–2020", episodes: "4", format: "Netflix Docu-series", credit: "Editor", video, poster, colour: "#2e9be6", placeholder: false },
    { title: "For Ahkeem", year: "2014–2016", format: "Feature Documentary", credit: "Post Production Supervisor", video, poster, colour: "#4c9a4c", placeholder: false },
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
