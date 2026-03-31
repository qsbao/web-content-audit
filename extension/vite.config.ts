import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync } from "fs";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome110",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        content: resolve(__dirname, "src/content/content.ts"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest-and-icons",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "src/manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
        // Copy icons
        const iconSrc = resolve(__dirname, "src/icons");
        const iconDst = resolve(__dirname, "dist/icons");
        mkdirSync(iconDst, { recursive: true });
        for (const f of readdirSync(iconSrc)) {
          copyFileSync(resolve(iconSrc, f), resolve(iconDst, f));
        }
      },
    },
  ],
});
