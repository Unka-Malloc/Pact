import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "server-web"),
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, "build", "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "server-web/index.html")
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
