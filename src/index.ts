import express from 'express';
import path from 'path';
import { config } from './config/env';
import { getActiveChannel } from './config/activeChannel';
import { logger } from './utils/logger';
import { collectRSS } from './collectors/rssCollector';
import { episodeMemory } from './memory/episodeMemory';
import { generateScript, generateScriptFromTopic } from './agents/scriptAgent';
import { factCheckScript } from './agents/factCheckAgent';
import { shiftCustomTopic } from './stream/topicQueue';
import { applyHostPersonality } from './agents/hostAgent';
import { synthesize } from './tts/ttsService';
import { updateScene, sceneRouter } from './renderer/sceneRenderer';
import { waitForNext } from './stream/playbackController';
import { episodeQueue, MAX_QUEUE } from './stream/episodeQueue';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve('./public')));
app.use('/api', sceneRouter);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildEpisode() {
  const customTopic = shiftCustomTopic();
  if (customTopic) {
    logger.info(`[producer] Custom topic: "${customTopic}"`);
    const draft = await generateScriptFromTopic(customTopic);
    const final = await applyHostPersonality(draft);
    const tts = await synthesize(final.script);
    logger.info(`[producer] Custom episode ready: "${final.title}"`);
    return { script: final, tts };
  }

  const channel = getActiveChannel();
  const items = await collectRSS(channel.feeds);

  if (items.length === 0) {
    throw new Error('RSS feeds returned 0 items — feeds may be down or unreachable');
  }

  let unseen = items.filter(item => !episodeMemory.hasSeen(item.url));

  if (unseen.length === 0) {
    logger.warn('All items seen — resetting history and looping from beginning');
    episodeMemory.reset();
    unseen = items;
  }

  const topic = unseen[0];
  logger.info(`[producer] Building episode: "${topic.title}"`);

  const draft = await generateScript(topic);
  const factChecked = await factCheckScript(draft, topic);
  const final = await applyHostPersonality(factChecked);
  const tts = await synthesize(final.script);

  episodeMemory.markSeen(topic.url, topic.title);
  logger.info(`[producer] Episode ready: "${final.title}" — queue ${episodeQueue.length + 1}/${MAX_QUEUE}`);

  return { script: final, tts };
}

async function producerLoop(): Promise<void> {
  logger.info('[producer] Started');
  while (true) {
    try {
      if (episodeQueue.length >= MAX_QUEUE) {
        await sleep(5_000);
        continue;
      }
      const episode = await buildEpisode();
      if (episode) episodeQueue.push(episode);
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`[producer] Error: ${msg}`);
      // Short wait for empty feeds (likely a temporary gap), longer for real errors
      const wait = msg.includes('0 items') ? 10_000 : 30_000;
      await sleep(wait);
    }
  }
}

async function consumerLoop(): Promise<void> {
  logger.info('[consumer] Started — waiting for first episode...');
  while (true) {
    if (episodeQueue.length === 0) {
      await sleep(2_000);
      continue;
    }

    const episode = episodeQueue.shift()!;
    updateScene(episode.script, episode.tts);

    const fallback = Math.max(
      episode.tts.estimatedDurationSeconds + 30,
      config.MIN_TOPIC_DURATION_SECONDS,
    );

    logger.info(`[consumer] Playing "${episode.script.title}" — ${episodeQueue.length} in queue`);
    await Promise.race([
      waitForNext(),
      sleep(fallback * 1000),
    ]);
  }
}

app.listen(config.SCENE_PORT, () => {
  logger.info(`Scene server → http://localhost:${config.SCENE_PORT}/scene.html`);
  logger.info(`Controls     → http://localhost:${config.SCENE_PORT}/controls.html`);
  void producerLoop();
  void consumerLoop();
});
