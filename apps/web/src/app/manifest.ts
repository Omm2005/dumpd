import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "dumpd",
    short_name: "dumpd",
    description: "A flow-first AI workspace for capturing and exploring dumpd.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf5",
    theme_color: "#fffaf5",
    orientation: "portrait",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
