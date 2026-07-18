import type { GeneratedScript } from '../agents/scriptAgent';
import type { TTSResult } from '../tts/ttsService';

export interface QueuedEpisode {
  script: GeneratedScript;
  tts: TTSResult;
}

export const episodeQueue: QueuedEpisode[] = [];
export const MAX_QUEUE = 10;

export function clearEpisodeQueue(): void {
  episodeQueue.length = 0;
}
