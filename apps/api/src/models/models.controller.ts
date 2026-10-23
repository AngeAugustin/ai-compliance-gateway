import { Controller, Get, NotFoundException, Param, Res, ServiceUnavailableException } from "@nestjs/common";
import type { Response } from "express";
import { NER_BROWSER_MODEL, pinnedModelFile } from "@acg/shared";
import { Public } from "../auth/guards.js";
import { checkFile, manifest, servedPath } from "./ner-model.store.js";

/**
 * Distribution locale du modèle NER de l'agent A1 (réseau interne au lieu du hub).
 *
 * Routes publiques : les poids sont publics (Hugging Face) et ne contiennent aucune
 * donnée de l'organisation. La confiance ne repose pas sur l'authentification mais
 * sur les empreintes figées, vérifiées ici avant de servir ET par l'agent à la réception.
 */
@Public()
@Controller("/v1/models/ner")
export class ModelsController {
  @Get("/manifest")
  async getManifest() {
    return manifest();
  }

  @Get("/files/:name")
  async rootFile(@Param("name") name: string, @Res() res: Response) {
    return this.serve(name, res);
  }

  @Get("/files/onnx/:name")
  async onnxFile(@Param("name") name: string, @Res() res: Response) {
    return this.serve(`onnx/${name}`, res);
  }

  private async serve(path: string, res: Response) {
    const file = pinnedModelFile(NER_BROWSER_MODEL, path);
    if (!file) throw new NotFoundException("Fichier hors du manifeste du modèle");
    const state = await checkFile(file);
    if (state.status === "absent") throw new NotFoundException(`Modèle non déposé sur le serveur : ${path}`);
    if (state.status === "mismatch") {
      throw new ServiceUnavailableException(`Empreinte invalide pour ${path} : fichier refusé`);
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("X-Content-SHA256", file.sha256);
    // Contenu adressé par révision + empreinte : immuable.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(servedPath(file));
  }
}
