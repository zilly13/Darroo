import type { ChannelConfig } from "../../pipeline/types.js";
import { eventsMunichChannel } from "./events-munich.js";
import { familiesMunichChannel } from "./families-munich.js";

/**
 * Every content-pipeline channel (collect -> filter -> cluster -> verify ->
 * write) is registered here. The Orte-Datenbank and Inserate modules have
 * their own registries (src/places, src/listings) because they don't go
 * through this pipeline shape.
 */
export const channels: ChannelConfig[] = [eventsMunichChannel, familiesMunichChannel];

export function getChannel(slug: string): ChannelConfig {
  const channel = channels.find((c) => c.slug === slug);
  if (!channel) {
    throw new Error(`Unknown channel "${slug}". Known channels: ${channels.map((c) => c.slug).join(", ")}`);
  }
  return channel;
}
