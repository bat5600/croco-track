import crypto from "crypto";

type KeyEntry = { version: string; key: Buffer };

function parseKeyring(): KeyEntry[] {
  const raw = process.env.GHL_TOKEN_ENC_KEYRING;
  if (!raw) {
    throw new Error("Missing env: GHL_TOKEN_ENC_KEYRING");
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [version, keyB64] = entry.split(":");
      if (!version || !keyB64) {
        throw new Error("GHL_TOKEN_ENC_KEYRING format must be vX:base64");
      }
      const key = Buffer.from(keyB64, "base64");
      if (key.length !== 32) {
        throw new Error(`Key ${version} must be 32 bytes base64`);
      }
      return { version, key };
    });

  if (!entries.length) {
    throw new Error("GHL_TOKEN_ENC_KEYRING is empty");
  }

  return entries;
}

function getActiveKey(keys: KeyEntry[]) {
  const active = process.env.GHL_TOKEN_ENC_KEY_ACTIVE;
  if (active) {
    const found = keys.find((entry) => entry.version === active);
    if (!found) {
      throw new Error(`Active key version ${active} not found in keyring`);
    }
    return found;
  }

  return keys[0];
}

function decryptWithKey(key: Buffer, payload: string) {
  const [ivB64, tagB64, cipherB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function encryptToken(value: string) {
  const keys = parseKeyring();
  const active = getActiveKey(keys);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", active.key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
  return `${active.version}:${payload}`;
}

export function decryptToken(payload: string) {
  const keys = parseKeyring();
  const [prefix, rest] = payload.includes(":") ? payload.split(":", 2) : ["", payload];

  if (prefix) {
    const match = keys.find((entry) => entry.version === prefix);
    if (!match) {
      throw new Error(`Unknown token key version ${prefix}`);
    }
    return decryptWithKey(match.key, rest);
  }

  for (const entry of keys) {
    try {
      return decryptWithKey(entry.key, rest);
    } catch {
      continue;
    }
  }

  throw new Error("Unable to decrypt token with available keys");
}
