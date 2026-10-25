import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Toyota NextMove",
    short_name: "NextMove",
    start_url: "/app",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#eb0a1e",
  };
}
