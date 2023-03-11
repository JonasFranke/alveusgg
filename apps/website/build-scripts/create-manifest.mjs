import fs from "node:fs";
import "./env.mjs";
import { env } from "../src/env/client.mjs";

const manifest = {
  name: "Alveus.gg",
  short_name: "Alveus.gg",
  icons: [
    {
      src: "/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
  theme_color: "#636a60",
  background_color: "#636a60",
  start_url: `${env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/homescreen`,
  display: "standalone",
};

fs.writeFileSync("public/site.webmanifest", JSON.stringify(manifest, null, 2));