import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  css: {
    postcss: {
      plugins: [{
        postcssPlugin: "noto-serif-woff2-only",
        Once(root: { walkDecls: (prop: string, callback: (declaration: { value: string }) => void) => void }) {
          // Run after imports, before Vite resolves font URLs into emitted assets.
          root.walkDecls("src", declaration => {
            if (declaration.value.includes("noto-serif-sc")) {
              declaration.value = declaration.value.replace(/,\s*url\([^)]*\.woff['"]?\)\s*format\(['"]?woff['"]?\)/g, "");
            }
          });
        },
      }],
    },
  },
});
