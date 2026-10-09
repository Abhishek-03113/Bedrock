import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const STATIC_DIR = resolve(__dirname, "../../static");
const ICONS_DIR = resolve(STATIC_DIR, "icons");

/**
 * Publish `<repo>/static/icons/*` at `icons/*` (dev server + build output) so the
 * manifest and <link> tags can reference them with relative URLs, no duplicated files.
 */
function staticIcons(): Plugin {
  return {
    name: "bedrock-static-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/icons\/([\w.-]+\.png)(?:\?.*)?$/.exec(req.url ?? "");
        if (!m) return next();
        try {
          const buf = readFileSync(resolve(ICONS_DIR, m[1]!));
          res.setHeader("Content-Type", "image/png");
          res.end(buf);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const name of readdirSync(ICONS_DIR)) {
        if (!name.endsWith(".png") || name.includes("1024")) continue;
        this.emitFile({
          type: "asset",
          fileName: `icons/${name}`,
          source: readFileSync(resolve(ICONS_DIR, name)),
        });
      }
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the laptop HTTP server can host the build at any path/host.
  base: "./",
  resolve: { alias: { "@static": STATIC_DIR } },
  plugins: [
    react(),
    staticIcons(),
    {
      // Avoid crossorigin attrs — Safari CORS on LAN http://IP is fragile.
      name: "strip-crossorigin",
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
      },
    },
  ],
  server: {
    host: true,
    port: 5174,
    cors: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Target older mobile Safari; avoid bleeding-edge syntax.
    target: ["es2020", "safari14"],
  },
});
