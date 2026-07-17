"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button } from "@/components/ui";
import { sendMerchantReplyAction, type ReplyState } from "../actions";

const initialState: ReplyState = { error: null, ok: false };

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const [state, formAction, pending] = useActionState(
    sendMerchantReplyAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="reply-text" className="sr-only">
        Reply to customer
      </label>
      <textarea
        id="reply-text"
        name="text"
        rows={3}
        required
        maxLength={2000}
        placeholder="Reply as the merchant…"
        className="w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-sm"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send on WhatsApp"}
      </Button>
    </form>
  );
}
