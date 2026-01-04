const GHL_API_BASE =
  process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";

function getHeaders(accessToken: string, versionOverride?: string) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  const version = versionOverride || process.env.GHL_API_VERSION || "2021-07-28";
  headers.set("Version", version);

  return headers;
}

async function fetchGhlJson<T>(
  path: string,
  accessToken: string,
  versionOverride?: string
): Promise<T> {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method: "GET",
    headers: getHeaders(accessToken, versionOverride),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export async function getLocationProfile(locationId: string, accessToken: string) {
  return fetchGhlJson<unknown>(
    `/locations/${encodeURIComponent(locationId)}`,
    accessToken,
    "2021-07-28"
  );
}

export async function getLocationSubscription(
  locationId: string,
  companyId: string,
  accessToken: string
) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  const query = params.toString();
  return fetchGhlJson<unknown>(
    `/saas/get-saas-subscription/${encodeURIComponent(locationId)}${
      query ? `?${query}` : ""
    }`,
    accessToken,
    "2021-04-15"
  );
}
