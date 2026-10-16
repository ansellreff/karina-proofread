import type { MetadataRoute } from "next";

/** Install on the phone (Add to Home screen): opens full screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karina Proofread",
    short_name: "Proofread",
    description: "Proofread student enrollment documents in Karina’s style",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f5f1", // --background (light)
    theme_color: "#2b3990",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
