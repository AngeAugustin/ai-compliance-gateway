/**
 * Dépose le modèle NER de l'agent A1 sur le serveur de l'API (models/ner-browser),
 * pour que les postes le récupèrent sur le réseau local plutôt que sur Internet.
 *
 *   pnpm models:ner                      télécharge depuis Hugging Face (révision figée)
 *   pnpm models:ner -- --from <dossier>  copie depuis un dossier local (clé USB, autre serveur)
 *   pnpm models:ner -- --dir <dossier>   dossier cible (défaut : NER_BROWSER_MODEL_DIR ou models/ner-browser)
 *
 * Chaque fichier est vérifié contre l'empreinte SHA-256 figée dans @acg/shared :
 * un fichier altéré n'est jamais installé.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NER_BROWSER_MODEL, hubFileUrl, type PinnedModelFile } from "../packages/shared/src/domain/ner-model.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sha256File(path: string): Promise<string> {
  return new Promise((ok, ko) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (c) => hash.update(c))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", ko);
  });
}

async function isValid(path: string, file: PinnedModelFile): Promise<boolean> {
  if (!existsSync(path)) return false;
  if ((await stat(path)).size !== file.size) return false;
  return (await sha256File(path)) === file.sha256;
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} Mo`;
}

async function download(url: string, target: string, expectedSize: number): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} sur ${url}`);
  let received = 0;
  let lastLog = 0;
  const started = Date.now();
  const progress = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (Date.now() - lastLog > 2000) {
        lastLog = Date.now();
        const rate = received / Math.max(1, (Date.now() - started) / 1000);
        process.stdout.write(`\r    ${mb(received)} / ${mb(expectedSize)} (${mb(rate)}/s)   `);
      }
      controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(progress) as never), createWriteStream(target));
  if (expectedSize > 1_000_000) process.stdout.write("\n");
}

async function main(): Promise<void> {
  const from = arg("--from");
  const dir = resolve(arg("--dir") ?? process.env.NER_BROWSER_MODEL_DIR ?? resolve(process.cwd(), "models", "ner-browser"));
  console.log(`Modèle ${NER_BROWSER_MODEL.id}@${NER_BROWSER_MODEL.revision.slice(0, 7)} → ${dir}`);

  let failures = 0;
  for (const file of NER_BROWSER_MODEL.files) {
    const target = resolve(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    if (await isValid(target, file)) {
      console.log(`  ✔ ${file.path} déjà présent et intègre`);
      continue;
    }
    const part = `${target}.part`;
    await rm(part, { force: true });
    const source = from ? resolve(from, file.path) : hubFileUrl(NER_BROWSER_MODEL, file.path);
    console.log(`  ↓ ${file.path} (${mb(file.size)}) depuis ${from ? "le dossier local" : "Hugging Face"}`);
    try {
      if (from) await pipeline(createReadStream(source), createWriteStream(part));
      else await download(source, part, file.size);
      if (!(await isValid(part, file))) {
        await rm(part, { force: true });
        throw new Error("empreinte SHA-256 différente de la valeur figée — fichier rejeté");
      }
      await rename(part, target);
      console.log(`  ✔ ${file.path} vérifié`);
    } catch (err) {
      failures++;
      console.error(`  ✖ ${file.path} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} fichier(s) en échec : l'API ne servira pas le modèle (les agents se replieront sur le hub).`);
    process.exitCode = 1;
    return;
  }
  console.log("Modèle prêt : GET /v1/models/ner/manifest doit indiquer available: true.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
