import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { logger } from '../utils/logger';

interface EpisodeRecord {
  url: string;
  title: string;
  timestamp: string;
}

interface EpisodeDB {
  seen: string[];
  episodes: EpisodeRecord[];
}

function loadDB(): EpisodeDB {
  try {
    if (fs.existsSync(config.EPISODE_DB_PATH)) {
      return JSON.parse(fs.readFileSync(config.EPISODE_DB_PATH, 'utf8')) as EpisodeDB;
    }
  } catch {
    logger.warn('Could not read episode DB, starting fresh.');
  }
  return { seen: [], episodes: [] };
}

function saveDB(db: EpisodeDB): void {
  const dir = path.dirname(config.EPISODE_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.EPISODE_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

class EpisodeMemory {
  private db: EpisodeDB;

  constructor() {
    this.db = loadDB();
    logger.info(`Episode memory loaded: ${this.db.seen.length} seen URLs`);
  }

  hasSeen(url: string): boolean {
    return this.db.seen.includes(url);
  }

  markSeen(url: string, title: string): void {
    if (this.hasSeen(url)) return;

    this.db.seen.push(url);
    this.db.episodes.push({ url, title, timestamp: new Date().toISOString() });

    // Trim old entries to avoid unbounded growth
    if (this.db.seen.length > config.MAX_SEEN_HISTORY) {
      const trim = this.db.seen.length - config.MAX_SEEN_HISTORY;
      this.db.seen.splice(0, trim);
      this.db.episodes.splice(0, trim);
    }

    saveDB(this.db);
  }

  reset(): void {
    this.db = { seen: [], episodes: [] };
    saveDB(this.db);
    logger.info('Episode memory reset — will loop from beginning');
  }

  getCount(): number {
    return this.db.episodes.length;
  }
}

export const episodeMemory = new EpisodeMemory();
