import { defineConfig } from "tsup";

export default defineConfig(({ watch }) => ({
  entry: ["src/main.ts"],
  splitting: true,
  sourcemap: true,
  clean: true,
  format: ["esm"],
  platform: "node",
  minify: false,
  dts: false,
  bundle: true,
  metafile: true,
  onSuccess: watch
    ? "node --enable-source-maps dist/main.mjs --inspect"
    : undefined,
  loader: {
    ".json": "copy",
  },
}));
