import { randomBytes } from "node:crypto";

/**
 * The code that ties a rupee landing in the client's bank account to a row in
 * our database. It goes in the UPI note, so it is what the operator sees in
 * GPay next to the credit, and it is what they search for in the console.
 *
 * Crockford-style alphabet with 0, O, 1 and I removed: these get read off a
 * phone screen and typed in by hand, and those are the four that get confused.
 *
 * 32 symbols over 6 places is about a billion codes, so collisions are a
 * theoretical concern rather than a practical one — but the column is unique
 * anyway and the caller retries, because "theoretical" is not "impossible".
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 6;

export function newReference(): string {
  // 256 / 32 is exactly 8, so masking a byte to five bits is unbiased. A
  // modulo of a non-power-of-two alphabet would not be.
  const bytes = randomBytes(LENGTH);
  let code = "";
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[bytes[i] & 31];
  return `TF-${code}`;
}
