import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashSecret(value: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(value, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifySecret(value: string, stored: string) {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const derived = (await scryptAsync(value, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

let dummyHash: string | null = null;

export async function dummySecretHash() {
  if (!dummyHash) dummyHash = await hashSecret("between-dummy-secret-not-used");
  return dummyHash;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}
