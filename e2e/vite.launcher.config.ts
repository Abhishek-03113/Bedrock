import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { staticAlias } from "../packages/desktop/vite.static-alias";

// Resolve the React plugin from the desktop workspace package (e2e has no copy).
const desktopRequire = createRequire(
  resolve(__dirname, "../packages/desktop/package.json"),
);
const react = desktopRequire("@vitejs/plugin-react") as typeof import("@vitejs/plugin-react");
const reactPlugin = (react as unknown as { default: typeof react.default }).default ?? react;

/** TV launcher renderer on its own, without Electron (window.bedrock is mocked). */
export default defineConfig({
  root: resolve(__dirname, "../packages/desktop/src/renderer"),
  resolve: { alias: staticAlias },
  server: { port: 5199, strictPort: true, host: "127.0.0.1" },
  plugins: [reactPlugin()],
});
