import {
  countFailedAttempts,
  deleteEmailFromQueue,
  isAlreadySent,
  moveEmailToDlq,
  readEmailBatch,
  type QueueMessage,
} from './emailQueueService.js';
import { EmailSendLog } from '../models/EmailSendLog.js';
import { EmailSendState } from '../models/EmailSendState.js';
import { sendMail } from './mailService.js';

const MAX_RETRIES = 5;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SEND_DELAY_MS = 200;
const DEFAULT_AUTH_TTL_MINUTES = 15;
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60;

let processing = false;

async function processQueue(
  queue: 'auth_emails' | 'transactional_emails',
  batchSize: number,
  sendDelayMs: number,
  ttlMinutes: number,
): Promise<{ processed: number; stopped?: string }> {
  const messages = await readEmailBatch(queue, batchSize, 30);
  if (!messages.length) return { processed: 0 };

  let totalProcessed = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg: QueueMessage = messages[i];
    const payload = msg.message;

    // Drop expired messages (TTL exceeded)
    if (payload.queued_at) {
      const ageMs = Date.now() - new Date(payload.queued_at).getTime();
      const maxAgeMs = ttlMinutes * 60 * 1000;
      if (ageMs > maxAgeMs) {
        console.warn('[emailProcessor] Email expired (TTL exceeded)', {
          queue,
          message_id: payload.message_id,
          queued_at: payload.queued_at,
        });
        await moveEmailToDlq(msg, `TTL exceeded (${ttlMinutes} minutes)`);
        continue;
      }
    }

    // Move to DLQ if max retries exceeded
    const failedAttempts = await countFailedAttempts(payload.message_id);
    if (failedAttempts >= MAX_RETRIES) {
      await moveEmailToDlq(msg, `Max retries (${MAX_RETRIES}) exceeded`);
      continue;
    }

    // Skip duplicates (already sent by another worker)
    if (payload.message_id && await isAlreadySent(payload.message_id)) {
      console.warn('[emailProcessor] Skipping duplicate send', { message_id: payload.message_id });
      await deleteEmailFromQueue(String(msg._id));
      continue;
    }

    try {
      await sendMail({
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      await EmailSendLog.create({
        message_id: payload.message_id ?? null,
        template_name: payload.label ?? queue,
        recipient_email: payload.to,
        status: 'sent',
      });

      await deleteEmailFromQueue(String(msg._id));
      totalProcessed++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[emailProcessor] Send failed', {
        queue,
        message_id: payload.message_id,
        error: errorMsg,
      });

      // Check for SMTP rate-limiting (nodemailer surfaces 451/452 or explicit 429)
      const isRateLimit = /429|451|452|too many|rate.?limit/i.test(errorMsg);
      if (isRateLimit) {
        await EmailSendLog.create({
          message_id: payload.message_id ?? null,
          template_name: payload.label ?? queue,
          recipient_email: payload.to,
          status: 'rate_limited',
          error_message: errorMsg.slice(0, 1000),
        });

        // Back off for 60 seconds
        const retryUntil = new Date(Date.now() + 60_000);
        await EmailSendState.findOneAndUpdate(
          { key: 'global' },
          { $set: { retry_after_until: retryUntil, updated_at: new Date() } },
          { upsert: true },
        );

        return { processed: totalProcessed, stopped: 'rate_limited' };
      }

      // Log non-transient failures
      await EmailSendLog.create({
        message_id: payload.message_id ?? null,
        template_name: payload.label ?? queue,
        recipient_email: payload.to,
        status: 'failed',
        error_message: errorMsg.slice(0, 1000),
      });
    }

    // Small delay between sends to smooth bursts
    if (i < messages.length - 1 && sendDelayMs > 0) {
      await new Promise((r) => setTimeout(r, sendDelayMs));
    }
  }

  return { processed: totalProcessed };
}

/**
 * Process both email queues (auth_emails first, then transactional_emails).
 * Safe to call concurrently — a guard prevents overlapping runs.
 */
export async function processEmailQueues(): Promise<{
  processed: number;
  skipped?: boolean;
  stopped?: string;
}> {
  if (processing) {
    return { processed: 0, skipped: true };
  }
  processing = true;

  try {
    const state = await EmailSendState.findOne({ key: 'global' }).lean();

    // Respect rate-limit cooldown
    if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
      return { processed: 0, skipped: true };
    }

    const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE;
    const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS;
    const ttlMinutes: Record<string, number> = {
      auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
      transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
    };

    let total = 0;

    for (const q of ['auth_emails', 'transactional_emails'] as const) {
      const result = await processQueue(q, batchSize, sendDelayMs, ttlMinutes[q]);
      total += result.processed;
      if (result.stopped) return { processed: total, stopped: result.stopped };
    }

    return { processed: total };
  } finally {
    processing = false;
  }
}
