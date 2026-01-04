import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function parseKeyring() {
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

function decryptWithKey(key, payload) {
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

function decryptToken(payload) {
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

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: node scripts/getAgencyToken.mjs <companyId>");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const { data, error } = await supabase
  .from("ghl_agencies")
  .select("agency_access_token_enc")
  .eq("company_id", companyId)
  .maybeSingle();

if (error) {
  console.error(`Supabase error: ${error.message}`);
  process.exit(1);
}

if (!data?.agency_access_token_enc) {
  console.error("No agency_access_token_enc found for companyId");
  process.exit(1);
}

const token = decryptToken(data.agency_access_token_enc);
console.log(token);
