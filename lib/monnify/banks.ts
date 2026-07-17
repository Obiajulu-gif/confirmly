import "server-only";
import { authedRequest } from "@/lib/monnify/auth";

export interface Bank {
  name: string;
  code: string;
}

let cachedBanks: { banks: Bank[]; expiresAt: number } | null = null;

/** Nigerian bank list from Monnify (cached for an hour). */
export async function getBanks(): Promise<Bank[]> {
  if (cachedBanks && Date.now() < cachedBanks.expiresAt) {
    return cachedBanks.banks;
  }
  const data = await authedRequest<Array<{ name?: string; code?: string }>>(
    "/api/v1/banks"
  );
  const banks = (data.responseBody ?? [])
    .filter((b): b is { name: string; code: string } =>
      Boolean(b.name && b.code)
    )
    .map((b) => ({ name: b.name, code: b.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedBanks = { banks, expiresAt: Date.now() + 60 * 60_000 };
  return banks;
}
