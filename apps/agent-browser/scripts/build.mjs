import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = resolve(root, "../src");
const out = resolve(root, "../dist");
await mkdir(out, { recursive: true });

await build({
  absWorkingDir: resolve(root, ".."),
  entryPoints: {
    background: resolve(src, "background.ts"),
    content: resolve(src, "content.ts"),
    popup: resolve(src, "popup.ts"),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outdir: out,
  sourcemap: true,
});

await build({
  absWorkingDir: resolve(root, ".."),
  entryPoints: { "page-hook": resolve(src, "page-hook.ts") },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  outdir: out,
  sourcemap: true,
});

await copyFile(resolve(src, "manifest.json"), resolve(out, "manifest.json"));
await copyFile(resolve(src, "popup.html"), resolve(out, "popup.html"));
console.log("Agent A1 compilé dans apps/agent-browser/dist");
