import type { SourceDefinition } from "../collectors/types.js";

/**
 * A channel is a config, not code: this is the object that makes the
 * "gemeinsamer Kern für alle Kanäle" possible (project notes, improvement #2).
 * Adding a new WhatsApp channel means adding one of these files under
 * src/config/channels/, never touching the pipeline itself.
 */
export interface ChannelConfig {
  slug: string;
  name: string;
  /** Plain-language description of what belongs in this channel, fed straight into AI prompts. */
  topic: string;
  sources: SourceDefinition[];
  /** Minimum title-similarity (0..1) for two items to be merged as "same event". */
  clusterSimilarityThreshold?: number;
}

export interface RunStats {
  sourcesOk: number;
  sourcesFailed: number;
  itemsCollected: number;
  itemsDuplicate: number;
  itemsRejected: number;
  clustersCreated: number;
  postsWritten: number;
}
