import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const nodeModules = fileURLToPath(new URL("./node_modules", import.meta.url));
const root = fileURLToPath(
  new URL("../docs/sonido-migration", import.meta.url),
);
const repo = fileURLToPath(new URL("..", import.meta.url));

// Serve só a página de comparação (docs/sonido-migration), com o CSS real do
// app e o Sonido instalado em web/node_modules.
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@juninmd\/sonido\/styles\.css$/,
        replacement: `${nodeModules}/@juninmd/sonido/dist/sonido.css`,
      },
      {
        find: /^@juninmd\/sonido$/,
        replacement: `${nodeModules}/@juninmd/sonido/dist/index.js`,
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: `${nodeModules}/react/jsx-runtime.js`,
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: `${nodeModules}/react/jsx-dev-runtime.js`,
      },
      {
        find: /^react-dom\/client$/,
        replacement: `${nodeModules}/react-dom/client.js`,
      },
      { find: /^react-dom$/, replacement: `${nodeModules}/react-dom/index.js` },
      { find: /^react$/, replacement: `${nodeModules}/react/index.js` },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5316,
    strictPort: true,
    fs: { allow: [repo, here] },
  },
});
