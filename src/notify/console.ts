import { logger } from "../utils/logger.js";
import type { ErrorNotification, Notifier } from "./types.js";

export class ConsoleNotifier implements Notifier {
  async send(notification: ErrorNotification): Promise<void> {
    logger.error(
      { channel: notification.channelSlug, step: notification.step, context: notification.context },
      notification.message,
    );
  }
}
