import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client (one instance per process) with automatic retry on
 * transient connection failures.
 *
 * The hosted Postgres endpoint auto-pauses when idle; the first query while it
 * resumes fails with "Can't reach database server". Without a retry a customer
 * signing up or logging in on a cold database sees "temporarily unavailable"
 * and gives up. The query extension below transparently retries such failures
 * with a short backoff — the database wakes within a few seconds — so callers
 * never see the cold-start.
 */

const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const RETRYABLE_MESSAGE =
  /can't reach database server|server has closed the connection|connection (closed|reset|refused)|timed out|ECONNREFUSED|ETIMEDOUT|Response from the Engine was empty|Timed out fetching a new connection/i;

/** True for transient connection-class failures worth retrying. */
export function isRetryableDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_CODES.has(error.code);
  }
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_MESSAGE.test(message);
}

const MAX_ATTEMPTS = 5;

/**
 * Runs a DB operation, retrying transient connection failures with backoff.
 * Non-retryable errors surface immediately. Exported for testing.
 */
export async function runWithDbRetry<T>(
  operation: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryableDbError(error)) throw error;
      // Back off while the paused database resumes (~5s cold-start).
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}

function createClient() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return runWithDbRetry(() => query(args));
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;

/** Interactive-transaction client for the extended `prisma` (use for `tx`). */
export type TxClient = Omit<
  Db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = globalThis as unknown as {
  prisma?: Db;
};

export const prisma: Db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
