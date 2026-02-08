import crypto from "node:crypto";

const KEY_PREFIX = "cja";

function getSalt(): string {
  return process.env.INGEST_HMAC_SALT ?? "development-salt";
}

export function hashApiSecret(secret: string): string {
  return crypto.createHmac("sha256", getSalt()).update(secret).digest("hex");
}

export function generateApiKey(): {
  plaintext: string;
  prefix: string;
  secretHash: string;
} {
  const prefix = crypto.randomBytes(4).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const plaintext = `${KEY_PREFIX}_${prefix}_${secret}`;

  return {
    plaintext,
    prefix,
    secretHash: hashApiSecret(secret),
  };
}

export function parseApiKey(
  input: string,
): { prefix: string; secret: string } | null {
  const parts = input.trim().split("_");
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) {
    return null;
  }

  return { prefix: parts[1], secret: parts[2] };
}

export function verifyApiKey(input: string, secretHash: string): boolean {
  const parsed = parseApiKey(input);
  if (!parsed) {
    return false;
  }

  const computed = hashApiSecret(parsed.secret);
  return crypto.timingSafeEqual(Buffer.from(secretHash), Buffer.from(computed));
}
