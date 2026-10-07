import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = resolve(root, "../src");
const out = resolve(root, "../dist");
await mkdir(out, { recursive: true });

/** Zod 4 embarque des regex littéraux (currencyCode, html5Email…) fragiles dans le SW MV3. */
const zodStub = resolve(src, "zod-stub.ts");

const shared = {
  absWorkingDir: resolve(root, ".."),
  bundle: true,
  platform: "browser",
  target: "chrome120",
  outdir: out,
  sourcemap: true,
  alias: { zod: zodStub },
};

await build({
  ...shared,
  entryPoints: {
    background: resolve(src, "background.ts"),
    content: resolve(src, "content.ts"),
    popup: resolve(src, "popup.ts"),
  },
  format: "esm",
});

await build({
  ...shared,
  entryPoints: { "page-hook": resolve(src, "page-hook.ts") },
  format: "iife",
});

await copyFile(resolve(src, "manifest.json"), resolve(out, "manifest.json"));
await copyFile(resolve(src, "popup.html"), resolve(out, "popup.html"));
console.log("Agent A1 compilé dans apps/agent-browser/dist");
