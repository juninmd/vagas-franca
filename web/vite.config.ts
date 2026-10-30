import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Em desenvolvimento o Vite serve o front e repassa /api para o servidor do Bun
// (`bun run web`, porta 3000 por padrão; mude com API_PORT).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT ?? 3000}` },
  },
  build: { outDir: "dist", target: "es2022" },
});
