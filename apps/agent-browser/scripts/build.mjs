import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
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
    offscreen: resolve(src, "offscreen.ts"),
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
await copyFile(resolve(src, "offscreen.html"), resolve(out, "offscreen.html"));

// ONNX Runtime WASM pour le NER local (offscreen) : MV3 interdit de le charger depuis un CDN.
const require = createRequire(import.meta.url);
const transformersEntry = require.resolve("@huggingface/transformers");
let ortRoot = dirname(createRequire(transformersEntry).resolve("onnxruntime-web"));
while (!ortRoot.endsWith("onnxruntime-web") && dirname(ortRoot) !== ortRoot) ortRoot = dirname(ortRoot);
const ortDist = resolve(ortRoot, "dist");
await mkdir(resolve(out, "ort"), { recursive: true });
for (const file of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  await copyFile(resolve(ortDist, file), resolve(out, "ort", file));
}
console.log("Agent A1 compilé dans apps/agent-browser/dist");
