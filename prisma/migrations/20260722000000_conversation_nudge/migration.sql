-- Abandoned-order nudge throttle: one gentle re-engagement per conversation.
ALTER TABLE "Conversation"
  ADD COLUMN "lastNudgeAt" TIMESTAMP(3);
