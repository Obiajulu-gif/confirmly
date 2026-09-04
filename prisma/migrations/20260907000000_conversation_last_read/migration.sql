-- Unread indicator: last time a merchant opened a chat (additive).

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastReadAt" TIMESTAMP(3);

