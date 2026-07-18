import 'dotenv/config';
import path from 'path';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export type TTSProvider = 'edge-tts' | 'windows-sapi' | 'stub';

export const config = {
  LOCAL_LLM_URL: optional('LOCAL_LLM_URL', 'http://localhost:11434'),
  LOCAL_LLM_MODEL: optional('LOCAL_LLM_MODEL', 'llama3.1'),

  TTS_PROVIDER: optional('TTS_PROVIDER', 'edge-tts') as TTSProvider,
  TTS_VOICE: optional('TTS_VOICE', 'en-US-GuyNeural'),

  SCENE_PORT: parseInt(optional('SCENE_PORT', '3000'), 10),

  MIN_TOPIC_DURATION_SECONDS: parseInt(optional('MIN_TOPIC_DURATION_SECONDS', '60'), 10),
  MAX_SEEN_HISTORY: parseInt(optional('MAX_SEEN_HISTORY', '500'), 10),

  EPISODE_DB_PATH: path.resolve(optional('EPISODE_DB_PATH', './data/episodes.json')),
  AUDIO_OUTPUT_DIR: path.resolve(optional('AUDIO_OUTPUT_DIR', './public/audio')),
  AUDIO_KEEP_COUNT: parseInt(optional('AUDIO_KEEP_COUNT', '50'), 10),
} as const;
