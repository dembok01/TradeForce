import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";

/**
 * Seals a secret for storage in mt5_instances, in the format the pool agent
 * expects: "iv.tag.ciphertext", each part base64, AES-256-GCM.
 *
 * There is deliberately no unseal() in the web app. Only the pool agent ever
 * needs plaintext, so the web tier has no code path that can produce it -- a
 * bug or an injection here cannot dump broker passwords.
 */
export function sealSecret(plain: string): string {
  const raw = process.env.MT5_CRED_KEY;
  if (!raw) throw new Error("MT5_CRED_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MT5_CRED_KEY must be 32 bytes, base64-encoded");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}
