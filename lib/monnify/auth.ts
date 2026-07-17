import "server-only";
import { requireEnv } from "@/lib/env";

/**
 * Monnify authentication + request core. The bearer token is generated and
 * cached server-side only — it never reaches a browser or a log line.
 */

export class MonnifyError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly responseCode: string | null = null
  ) {
    super(message);
    this.name = "MonnifyError";
  }
}

export interface MonnifyEnvelope<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: T;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function clearTokenCache() {
  cachedToken = null;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const e = requireEnv("MONNIFY_API_KEY", "MONNIFY_SECRET_KEY");
  const basic = Buffer.from(
    `${e.MONNIFY_API_KEY}:${e.MONNIFY_SECRET_KEY}`
  ).toString("base64");

  const response = await fetch(`${e.MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new MonnifyError(`auth failed: HTTP ${response.status}`, response.status);
  }
  const data = (await response.json()) as MonnifyEnvelope<{
    accessToken: string;
    expiresIn: number;
  }>;
  if (!data.requestSuccessful || !data.responseBody?.accessToken) {
    throw new MonnifyError("auth failed: no token", response.status, data.responseCode);
  }
  const ttlMs = Math.max((data.responseBody.expiresIn - 60) * 1000, 30_000);
  cachedToken = {
    token: data.responseBody.accessToken,
    expiresAt: Date.now() + ttlMs,
  };
  return cachedToken.token;
}

export async function authedRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<MonnifyEnvelope<T>> {
  const e = requireEnv("MONNIFY_API_KEY", "MONNIFY_SECRET_KEY");
  const token = await getAccessToken();
  const response = await fetch(`${e.MONNIFY_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  let data: MonnifyEnvelope<T>;
  try {
    data = (await response.json()) as MonnifyEnvelope<T>;
  } catch {
    throw new MonnifyError(
      `invalid JSON from Monnify: HTTP ${response.status}`,
      response.status
    );
  }
  if (!response.ok || !data.requestSuccessful) {
    throw new MonnifyError(
      data.responseMessage || `HTTP ${response.status}`,
      response.status,
      data.responseCode ?? null
    );
  }
  return data;
}

/** True when a provider error means "this feature is not enabled". */
export function isFeatureUnavailable(err: unknown): boolean {
  if (!(err instanceof MonnifyError)) return false;
  if (err.status === 403 || err.status === 404) return true;
  return /not (enabled|available|activated)|activation|unauthorized feature|access denied/i.test(
    err.message
  );
}
