/**
 * Modèle NER de l'agent navigateur (A1), figé par révision et par empreinte.
 *
 * Le modèle fait partie du code de confiance de l'agent : ses empreintes sont
 * compilées dans l'extension. Qu'il vienne de l'API ACG (réseau local) ou du hub
 * Hugging Face (repli), un fichier dont le SHA-256 diffère est refusé. Changer de
 * modèle = publier une nouvelle version de l'agent, comme pour tout autre code.
 *
 * Empreintes : `lfs.oid` publié par Hugging Face pour le fichier ONNX, SHA-256
 * calculé localement pour les fichiers texte (blobs git vérifiés sur la révision).
 */
export interface PinnedModelFile {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

export interface PinnedModel {
  id: string;
  revision: string;
  dtype: "q8";
  files: readonly PinnedModelFile[];
}

export const NER_BROWSER_MODEL: PinnedModel = {
  id: "Xenova/bert-base-multilingual-cased-ner-hrl",
  revision: "263e82c06569c8c2ac46238a7ae5107598934234",
  dtype: "q8",
  files: [
    {
      path: "config.json",
      sha256: "7aa891abae067f95a40f5e2005b3de44824a083f256802934a993d301ec25076",
      size: 1207,
      contentType: "application/json",
    },
    {
      path: "tokenizer_config.json",
      sha256: "e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a",
      size: 367,
      contentType: "application/json",
    },
    {
      path: "tokenizer.json",
      sha256: "bf1b59b7b11c95f194f51708d918eea378e09d05f84c0e1656dc5180e8117088",
      size: 2919362,
      contentType: "application/json",
    },
    {
      path: "onnx/model_quantized.onnx",
      sha256: "5b65139844be260b624a2a13782b01d122e613d64ce16ed0ba4d82e0b816f1a9",
      size: 178495423,
      contentType: "application/octet-stream",
    },
  ],
};

/** Clé de `expectedModelHashes` (sync) pour le fichier ONNX du NER navigateur. */
export const NER_BROWSER_HASH_KEY = "ner-browser";

export function pinnedModelFile(model: PinnedModel, path: string): PinnedModelFile | undefined {
  return model.files.find((f) => f.path === path);
}

/** URL du fichier sur le hub, à la révision figée (sert aussi de clé de cache à transformers.js). */
export function hubFileUrl(model: PinnedModel, path: string): string {
  return `https://huggingface.co/${model.id}/resolve/${model.revision}/${path}`;
}

export function onnxFile(model: PinnedModel): PinnedModelFile {
  return model.files.find((f) => f.path.endsWith(".onnx"))!;
}
