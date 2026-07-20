import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { EmailQueue, type EmailQueueName, type IEmailMessage } from '../models/EmailQueue.js';
import { EmailSendLog } from '../models/EmailSendLog.js';

const VISIBILITY_TIMEOUT_SECONDS = 30;

/** Enqueue an email message. Returns the MongoDB document _id. */
export async function enqueueEmail(
  queue: EmailQueueName,
  message: Omit<IEmailMessage, 'message_id' | 'queued_at'> & Partial<Pick<IEmailMessage, 'message_id' | 'queued_at'>>,
): Promise<string> {
  const doc = await EmailQueue.create({
    queue,
    message: {
      ...message,
      message_id: message.message_id ?? randomUUID(),
      queued_at: message.queued_at ?? new Date().toISOString(),
    },
    visible_after: new Date(),
    tries: 0,
    deleted_at: null,
  });
  return String(doc._id);
}

export interface QueueMessage {
  _id: Types.ObjectId;
  queue: EmailQueueName;
  message: IEmailMessage;
  tries: number;
}

/**
 * Atomically claim up to `batchSize` visible, non-deleted messages.
 * Claimed messages are hidden for `vtSeconds` seconds (visibility timeout).
 */
export async function readEmailBatch(
  queue: EmailQueueName,
  batchSize: number,
  vtSeconds = VISIBILITY_TIMEOUT_SECONDS,
): Promise<QueueMessage[]> {
  const now = new Date();
  const vtExpiry = new Date(now.getTime() + vtSeconds * 1000);
  const results: QueueMessage[] = [];

  // Claim one-by-one to avoid race conditions (findOneAndUpdate is atomic)
  for (let i = 0; i < batchSize; i++) {
    const doc = await EmailQueue.findOneAndUpdate(
      { queue, visible_after: { $lte: now }, deleted_at: null },
      { $inc: { tries: 1 }, $set: { visible_after: vtExpiry } },
      { new: true, sort: { created_at: 1 } },
    ).lean();

    if (!doc) break;

    results.push({
      _id: doc._id as Types.ObjectId,
      queue: doc.queue as EmailQueueName,
      message: doc.message as IEmailMessage,
      tries: doc.tries,
    });
  }

  return results;
}

/** Permanently delete a message from the queue (after successful send). */
export async function deleteEmailFromQueue(msgObjectId: string): Promise<void> {
  await EmailQueue.updateOne(
    { _id: msgObjectId },
    { $set: { deleted_at: new Date() } },
  );
}

/** Move a message to the dead-letter log and delete it from the queue. */
export async function moveEmailToDlq(
  msg: QueueMessage,
  reason: string,
): Promise<void> {
  await EmailSendLog.create({
    message_id: msg.message.message_id ?? null,
    template_name: msg.message.label ?? msg.queue,
    recipient_email: msg.message.to,
    status: 'dlq',
    error_message: reason,
  });

  await deleteEmailFromQueue(String(msg._id));
}

/** Return count of failed send attempts for a given message_id. */
export async function countFailedAttempts(messageId: string): Promise<number> {
  return EmailSendLog.countDocuments({ message_id: messageId, status: 'failed' });
}

/** Check if a message was already successfully sent (dedup guard). */
export async function isAlreadySent(messageId: string): Promise<boolean> {
  const doc = await EmailSendLog.findOne({ message_id: messageId, status: 'sent' }).lean();
  return Boolean(doc);
}
