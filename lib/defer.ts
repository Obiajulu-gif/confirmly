import { after } from "next/server";

/**
 * Schedules work to run after the response is sent (Next.js `after`).
 * Outside a request scope (tests, scripts) it runs the task on the
 * microtask queue instead so behaviour stays observable.
 */
export function defer(task: () => void | Promise<void>): void {
  try {
    after(task);
  } catch {
    void Promise.resolve()
      .then(task)
      .catch(() => {
        /* the task is responsible for its own error logging */
      });
  }
}
