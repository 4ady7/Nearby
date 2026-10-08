import "server-only";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { LIMITS } from "@/lib/constants";
import { HttpError } from "./http";
import { uploadsDir } from "./db";

const SAFE_NAME = /^[a-f0-9]{32}\.(jpg|png|gif|webp|webm|mp3|m4a|wav|ogg|mp4|mov)$/;

export function mediaPath(storageName: string) {
  if (!SAFE_NAME.test(storageName)) throw new HttpError(404, "That file isn't available.", "NOT_FOUND");
  const full = path.join(uploadsDir(), storageName);
  if (!full.startsWith(uploadsDir())) throw new HttpError(404, "That file isn't available.", "NOT_FOUND");
  return full;
}

export function removeFiles(names: string[]) {
  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue;
    try {
      fs.unlinkSync(path.join(uploadsDir(), name));
    } catch {
      /* already gone */
    }
  }
}

type Sniffed = { mime: string; ext: string; kind: "image" | "audio" | "video" };

export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png", kind: "image" };
  }
  const gif = buf.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return { mime: "image/gif", ext: "gif", kind: "image" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: "webp", kind: "image" };
  }
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") {
    return { mime: "audio/wav", ext: "wav", kind: "audio" };
  }
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return { mime: "audio/ogg", ext: "ogg", kind: "audio" };
  if (buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) {
    return { mime: "audio/mpeg", ext: "mp3", kind: "audio" };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mime: "video/webm", ext: "webm", kind: "video" };
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("M4A")) return { mime: "audio/mp4", ext: "m4a", kind: "audio" };
    return { mime: "video/mp4", ext: "mp4", kind: "video" };
  }
  return null;
}

export async function saveUpload(file: File, expected: "image" | "audio" | "video") {
  if (!(file instanceof File) || file.size <= 0) throw new HttpError(400, "Choose a file first.", "VALIDATION");
  const max = expected === "image" ? LIMITS.image : expected === "audio" ? LIMITS.audio : LIMITS.video;
  if (file.size > max) throw new HttpError(413, "That file is too large.", "TOO_LARGE");
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniff(buf);
  if (!sniffed) throw new HttpError(400, "That file type isn't supported.", "VALIDATION");
  const allowed =
    (expected === "image" && sniffed.kind === "image") ||
    (expected === "audio" && (sniffed.kind === "audio" || sniffed.ext === "webm" || sniffed.ext === "mp4")) ||
    (expected === "video" && (sniffed.kind === "video" || sniffed.ext === "webm" || sniffed.ext === "mp4"));
  if (!allowed) {
    throw new HttpError(400, expected === "image" ? "Choose a photo." : "That file type isn't supported.", "VALIDATION");
  }
  let mime = sniffed.mime;
  if (expected === "audio" && sniffed.ext === "webm") mime = "audio/webm";
  if (expected === "audio" && sniffed.ext === "mp4") mime = "audio/mp4";
  const storageName = `${randomBytes(16).toString("hex")}.${sniffed.ext}`;
  fs.writeFileSync(mediaPath(storageName), buf);
  return { storageName, mime, size: buf.length, kind: expected };
}
