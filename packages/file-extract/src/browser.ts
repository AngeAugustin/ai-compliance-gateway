/**
 * Extraction navigateur — OCR local non embarqué (MV3).
 * Les images dégradées sont renvoyées à l'API (`/v1/interactions/extract-files`) pour OCR Node.
 */
export * from "./types.js";
export * from "./detect.js";
export * from "./combine.js";
export { extractOne, extractFiles } from "./engine.js";
