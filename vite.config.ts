import { DEFAULT_SERVER_PORT } from "./server/config/ServerEnv.mjs";

import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const webRoot = path.resolve(__dirname, "server-web");

export default defineConfig({
  root: webRoot,
  plugins: [vue()],
  resolve: {
    alias: {
      // Absolute imports from any depth: @/ → server-web/
      "@": webRoot,
      // Convenience shorthands
      "@components": path.resolve(webRoot, "components"),
      "@composables": path.resolve(webRoot, "composables"),
      "@views": path.resolve(webRoot, "views"),
      "@lib": path.resolve(webRoot, "lib"),
      "@router": path.resolve(webRoot, "router"),
      "@types": path.resolve(webRoot, "types"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "build", "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(webRoot, "index.html"),
      },
      output: {
        // Split vendor (Vue + vue-router + Element Plus) from app code
        manualChunks: (id) => {
          if (id.includes("node_modules/vue/") || id.includes("node_modules/vue-router/")) {
            return "vue";
          }
          if (id.includes("node_modules/element-plus/")) {
            return "element-plus";
          }
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_ORIGIN || `http://127.0.0.1:${process.env.VITE_API_PORT || DEFAULT_SERVER_PORT}`,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          const targetOrigin =
            process.env.VITE_API_ORIGIN ||
            `http://127.0.0.1:${process.env.VITE_API_PORT || DEFAULT_SERVER_PORT}`;
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("origin", targetOrigin);
          });
        },
      },
    },
  },
});
