import crypto from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
