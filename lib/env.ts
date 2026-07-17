import { z } from "zod";

/**
 * Server-side environment access.
 *
 * All variables are optional at parse time so the app can build and boot
 * before every integration is configured; each integration must call
 * `requireEnv(...)` before using its credentials, and `integrationStatus()`
 * powers safe configured/missing diagnostics (names only, never values).
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  ENCRYPTION_KEY: z.string().min(16).optional(),
  RECEIPT_TOKEN_SECRET: z.string().min(16).optional(),
  DEMO_MERCHANT_EMAIL: z.string().email().optional(),
  DEMO_MERCHANT_PASSWORD: z.string().min(8).optional(),

  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v23.0"),
  /** Public display number customers chat with (not a secret). */
  WHATSAPP_PUBLIC_NUMBER: z
    .string()
    .regex(/^\+?[\d\s().-]{7,20}$/)
    .optional(),

  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_BASE_URL: z
    .string()
    .url()
    .default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_ORDER_MODEL: z.string().default("nvidia/nemotron-3-nano-30b-a3b"),

  MONNIFY_BASE_URL: z.string().url().default("https://sandbox.monnify.com"),
  MONNIFY_API_KEY: z.string().min(1).optional(),
  MONNIFY_SECRET_KEY: z.string().min(1).optional(),
  MONNIFY_CONTRACT_CODE: z.string().min(1).optional(),
  /** Route checkouts through merchant subaccounts (requires the Monnify
   *  Sub Account feature on the platform account). */
  MONNIFY_SUBACCOUNT_ENABLED: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
  MONNIFY_PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(0),

  DEMO_MODE: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function deployedOrigin(configured: string): string {
  const normalized = configured.replace(/\/$/, "");
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized);
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (isLocal && vercelHost) {
    const withProtocol = /^https?:\/\//i.test(vercelHost)
      ? vercelHost
      : `https://${vercelHost}`;
    return withProtocol.replace(/\/$/, "");
  }
  return normalized;
}

export function env(): Env {
  if (!cached) {
    // Trim every value — dashboard/CLI tooling can smuggle in stray
    // whitespace or CRLF that would otherwise fail strict validation.
    const trimmed = Object.fromEntries(
      Object.entries(process.env).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
    );
    const parsed = envSchema.parse(trimmed);
    // Ensure every existing env().APP_URL consumer generates a public Vercel
    // URL rather than localhost when APP_URL was omitted from the dashboard.
    parsed.APP_URL = deployedOrigin(parsed.APP_URL);
    cached = parsed;
  }
  return cached;
}

/** Canonical public application origin. */
export function appUrl(): string {
  return env().APP_URL;
}

/** Test helper — clears the memoized env. */
export function resetEnvCache() {
  cached = null;
}

export class MissingEnvError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `Missing required environment variables: ${keys.join(", ")}. ` +
        `Run "npm run secrets:import" locally or configure them in Vercel.`
    );
    this.name = "MissingEnvError";
  }
}

/** Returns the env, throwing a clear error if any of the keys are missing. */
export function requireEnv<K extends keyof Env>(
  ...keys: K[]
): { [P in K]-?: NonNullable<Env[P]> } & Env {
  const e = env();
  const missing = keys.filter((k) => e[k] === undefined || e[k] === "");
  if (missing.length) throw new MissingEnvError(missing as string[]);
  return e as { [P in K]-?: NonNullable<Env[P]> } & Env;
}

export type IntegrationName = "database" | "whatsapp" | "nvidia" | "monnify";

const INTEGRATION_KEYS: Record<IntegrationName, (keyof Env)[]> = {
  database: ["DATABASE_URL"],
  whatsapp: [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ],
  nvidia: ["NVIDIA_API_KEY"],
  monnify: ["MONNIFY_API_KEY", "MONNIFY_SECRET_KEY", "MONNIFY_CONTRACT_CODE"],
};

/** Safe diagnostics: which integrations are configured, and which variable
 *  NAMES are missing. Never exposes values. */
export function integrationStatus() {
  const e = env();
  const out: Record<
    IntegrationName,
    { configured: boolean; missing: string[] }
  > = {} as never;
  for (const [name, keys] of Object.entries(INTEGRATION_KEYS)) {
    const missing = keys.filter((k) => !e[k as keyof Env]);
    out[name as IntegrationName] = {
      configured: missing.length === 0,
      missing: missing as string[],
    };
  }
  return out;
}

/** Demo mode is only honoured when explicitly enabled. */
export function isDemoMode(): boolean {
  return env().DEMO_MODE === true;
}
