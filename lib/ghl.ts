type TokenExchangeResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  companyId?: string;
  userType?: string;
  scope?: string;
};

const GHL_BASE_URL =
  process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function buildInstallUrl(state?: string) {
  const installUrl = requireEnv("GHL_INSTALL_URL"); // obligatoire
  const url = new URL(installUrl);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}


export async function exchangeCodeForAgencyToken(code: string) {
  const clientId = requireEnv("GHL_CLIENT_ID");
  const clientSecret = requireEnv("GHL_CLIENT_SECRET");
  const redirectUri = requireEnv("GHL_REDIRECT_URI");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    user_type: "Company",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${GHL_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL token exchange failed: ${res.status} ${text}`);
  }

  return (await res.json()) as TokenExchangeResponse;
}

export async function refreshAgencyToken(refreshToken: string) {
  const clientId = requireEnv("GHL_CLIENT_ID");
  const clientSecret = requireEnv("GHL_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${GHL_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL refresh failed: ${res.status} ${text}`);
  }

  return (await res.json()) as TokenExchangeResponse;
}

export async function exchangeLocationToken(params: {
  companyId: string;
  locationId: string;
  agencyAccessToken: string;
}) {
  const res = await fetch(`${GHL_BASE_URL}/oauth/locationToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.agencyAccessToken}`,
    },
    body: JSON.stringify({
      companyId: params.companyId,
      locationId: params.locationId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL location token failed: ${text}`);
  }

  return (await res.json()) as TokenExchangeResponse;
}
