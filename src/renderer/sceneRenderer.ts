import express from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { signalNext } from '../stream/playbackController';
import { addCustomTopic, getCustomTopics } from '../stream/topicQueue';
import { switchChannel, setCustomChannel, getActiveChannel, listChannels } from '../config/activeChannel';
import { clearEpisodeQueue } from '../stream/episodeQueue';
import type { GeneratedScript } from '../agents/scriptAgent';
import type { TTSResult } from '../tts/ttsService';

export interface CurrentTopic {
  title: string;
  script: string;
  bullets: string[];
  audioPath: string;
  estimatedDurationSeconds: number;
  updatedAt: string;
}

interface EpisodeRecord {
  title: string;
  audioUrl: string;
  updatedAt: string;
  script: string;
  bullets: string[];
  estimatedDurationSeconds: number;
}

const HISTORY_PATH = path.resolve('./data/episode-history.json');

let currentTopic: CurrentTopic = {
  title: 'Initializing...',
  script: 'Loading cybersecurity news feed...',
  bullets: ['Loading cybersecurity news feed...'],
  audioPath: '',
  estimatedDurationSeconds: 0,
  updatedAt: new Date().toISOString(),
};

function audioFileExists(audioUrl: string): boolean {
  const filePath = path.resolve('./public' + audioUrl);
  return fs.existsSync(filePath);
}

function loadHistory(): EpisodeRecord[] {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const records = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) as EpisodeRecord[];
      // Only keep entries whose audio files still exist on disk
      return records.filter(r => audioFileExists(r.audioUrl));
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history: EpisodeRecord[]): void {
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

const episodeHistory: EpisodeRecord[] = loadHistory();
logger.info(`Episode history loaded: ${episodeHistory.length} entries`);

let playPending: string | null = null;

export function updateScene(script: GeneratedScript, tts: TTSResult): void {
  currentTopic = {
    title: script.title,
    script: script.script,
    bullets: script.bullets,
    audioPath: tts.audioUrl,
    estimatedDurationSeconds: tts.estimatedDurationSeconds,
    updatedAt: new Date().toISOString(),
  };

  episodeHistory.unshift({
    title: script.title,
    audioUrl: tts.audioUrl,
    updatedAt: currentTopic.updatedAt,
    script: script.script,
    bullets: script.bullets,
    estimatedDurationSeconds: tts.estimatedDurationSeconds,
  });
  if (episodeHistory.length > 100) episodeHistory.pop();
  saveHistory(episodeHistory);

  logger.info(`Scene updated: "${currentTopic.title}"`);
}

export const sceneRouter = express.Router();

sceneRouter.get('/current-topic', (_req, res) => {
  res.json(currentTopic);
});

sceneRouter.post('/next', (_req, res) => {
  logger.info('Audio ended — advancing to next episode');
  signalNext();
  res.json({ ok: true });
});

sceneRouter.post('/prev', (_req, res) => {
  const valid = episodeHistory.filter(r => audioFileExists(r.audioUrl));
  // index 0 = currently playing, index 1 = the one before it
  const prev = valid[1];
  if (!prev) { res.status(404).json({ error: 'No previous episode' }); return; }

  // Point currentTopic at the previous episode so that pollTopic (which
  // compares data.title to lastTitle) sees no change and does not
  // immediately override the browser's playback back to episode N.
  currentTopic = {
    title: prev.title,
    script: prev.script ?? '',
    bullets: prev.bullets ?? [],
    audioPath: prev.audioUrl,
    estimatedDurationSeconds: prev.estimatedDurationSeconds ?? 60,
    updatedAt: prev.updatedAt,
  };

  logger.info(`Play previous: ${prev.title}`);
  res.json({
    ok: true,
    audioUrl: prev.audioUrl,
    title: prev.title,
    script: prev.script ?? '',
    bullets: prev.bullets ?? [],
    estimatedDurationSeconds: prev.estimatedDurationSeconds ?? 60,
  });
});

sceneRouter.get('/episodes', (_req, res) => {
  // Re-filter on every request in case audio files were pruned
  const valid = episodeHistory.filter(r => audioFileExists(r.audioUrl));
  res.json(valid);
});

sceneRouter.post('/play-episode', (req, res) => {
  const { audioUrl } = req.body as { audioUrl?: string };
  if (!audioUrl) { res.status(400).json({ error: 'audioUrl required' }); return; }
  playPending = audioUrl;
  logger.info(`Play requested: ${audioUrl}`);
  res.json({ ok: true });
});

sceneRouter.get('/play-status', (_req, res) => {
  const pending = playPending;
  playPending = null;
  res.json({ audioUrl: pending });
});

sceneRouter.post('/add-topic', (req, res) => {
  const { topic } = req.body as { topic?: string };
  if (!topic?.trim()) { res.status(400).json({ error: 'topic required' }); return; }
  addCustomTopic(topic);
  logger.info(`Custom topic queued: "${topic}"`);
  res.json({ ok: true, pending: getCustomTopics() });
});

sceneRouter.get('/custom-topics', (_req, res) => {
  res.json(getCustomTopics());
});

sceneRouter.get('/channels', (_req, res) => {
  const active = getActiveChannel();
  res.json({
    channels: listChannels(),
    active: active.id,
    activeChannel: { id: active.id, name: active.name, hostName: active.hostName },
  });
});

sceneRouter.post('/channel', (req, res) => {
  const { id } = req.body as { id?: string };
  if (!id) { res.status(400).json({ error: 'id required' }); return; }
  try {
    const ch = switchChannel(id);
    clearEpisodeQueue();
    logger.info(`Channel switched to: ${ch.name}`);
    res.json({ ok: true, channel: { id: ch.id, name: ch.name, hostName: ch.hostName } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

sceneRouter.post('/custom-channel', (req, res) => {
  const { topic } = req.body as { topic?: string };
  if (!topic?.trim()) { res.status(400).json({ error: 'topic required' }); return; }
  const ch = setCustomChannel(topic.trim());
  clearEpisodeQueue();
  logger.info(`Custom channel launched: "${topic}"`);
  res.json({ ok: true, channel: { id: ch.id, name: ch.name, hostName: ch.hostName } });
});
