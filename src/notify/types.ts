export interface ErrorNotification {
  channelSlug: string;
  step: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Notifier {
  send(notification: ErrorNotification): Promise<void>;
}
