const GHL_API_BASE =
  process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";

function getHeaders(accessToken: string) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  const version = process.env.GHL_API_VERSION;
  if (version) {
    headers.set("Version", version);
  }

  return headers;
}

async function fetchGhlJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export async function getLocationProfile(locationId: string, accessToken: string) {
  return fetchGhlJson<unknown>(`/locations/${locationId}`, accessToken);
}

export async function getLocationSubscription(
  locationId: string,
  accessToken: string
) {
  return fetchGhlJson<unknown>(
    `/saas/location/${locationId}/subscription`,
    accessToken
  );
}
