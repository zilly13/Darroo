import { db } from "../db/client.js";
import { pipelineErrors } from "../db/schema.js";
import { ConsoleNotifier } from "./console.js";
import { TelegramNotifier } from "./telegram.js";
import type { ErrorNotification, Notifier } from "./types.js";

const sinks: Notifier[] = [new ConsoleNotifier()];

if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  sinks.push(new TelegramNotifier(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID));
}

/**
 * Records a pipeline error permanently (visible in the DB/admin even if no
 * alert channel is configured) and fans it out to every configured sink.
 * Call this instead of letting a step throw into the void.
 */
export async function reportError(
  notification: ErrorNotification & { runLogId?: string },
): Promise<void> {
  await Promise.allSettled([
    db.insert(pipelineErrors).values({
      runLogId: notification.runLogId,
      channelSlug: notification.channelSlug,
      step: notification.step,
      message: notification.message,
      context: notification.context,
      notifiedAt: new Date(),
    }),
    ...sinks.map((sink) => sink.send(notification)),
  ]);
}
