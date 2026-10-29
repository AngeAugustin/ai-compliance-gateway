/**
 * Chiffrement symétrique par la clé maîtresse du Vault (AES-256-GCM). Sert à protéger
 * au repos la clé privée de séquestre et les secrets TOTP ; le séquestre des valeurs
 * masquées lui-même est un chiffrement à clé publique (voir @acg/shared, crypto/escrow).
 */
export { decryptValue, encodeKeyMaterial, encryptValue, importMasterKey } from "./crypto.js";
