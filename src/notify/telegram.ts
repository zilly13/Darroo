import { logger } from "../utils/logger.js";
import type { ErrorNotification, Notifier } from "./types.js";

/**
 * Free error alerting: a Telegram bot costs nothing and delivers a push
 * notification within seconds. This is what turns "fails silently" (the
 * n8n workflow's biggest problem, per the project notes) into "someone
 * gets pinged". Configure TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to enable.
 */
export class TelegramNotifier implements Notifier {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async send(notification: ErrorNotification): Promise<void> {
    const text = `⚠️ darroo [${notification.channelSlug}/${notification.step}]\n${notification.message}`;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
      if (!res.ok) {
        logger.error({ status: res.status }, "Telegram notification failed to send");
      }
    } catch (err) {
      // Never let a failed *notification* crash the pipeline run.
      logger.error({ err }, "Telegram notification threw");
    }
  }
}
