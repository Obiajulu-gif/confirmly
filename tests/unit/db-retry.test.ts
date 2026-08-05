import { describe, expect, it, vi } from "vitest";
import { isRetryableDbError, runWithDbRetry } from "@/lib/db";

const coldStart = () => new Error("Can't reach database server at `db.host:5432`");
const fatal = () => new Error("Unique constraint failed on the fields: (`email`)");

describe("isRetryableDbError", () => {
  it("flags transient connection failures", () => {
    expect(isRetryableDbError(coldStart())).toBe(true);
    expect(isRetryableDbError(new Error("Server has closed the connection"))).toBe(true);
    expect(isRetryableDbError(new Error("Timed out fetching a new connection"))).toBe(true);
  });

  it("does not flag ordinary query errors", () => {
    expect(isRetryableDbError(fatal())).toBe(false);
    expect(isRetryableDbError(new Error("record not found"))).toBe(false);
  });
});

describe("runWithDbRetry", () => {
  it("recovers a cold-start: retries the connection error, then succeeds", async () => {
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw coldStart(); // fails twice while the DB wakes
      return "ok";
    });
    const result = await runWithDbRetry(op, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("never retries a non-connection error", async () => {
    const op = vi.fn(async () => {
      throw fatal();
    });
    await expect(runWithDbRetry(op, { baseDelayMs: 1 })).rejects.toThrow(
      /Unique constraint/
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts when the DB never recovers", async () => {
    const op = vi.fn(async () => {
      throw coldStart();
    });
    await expect(
      runWithDbRetry(op, { baseDelayMs: 1, maxAttempts: 4 })
    ).rejects.toThrow(/Can't reach database server/);
    expect(op).toHaveBeenCalledTimes(4);
  });
});
