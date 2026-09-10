import fs from 'fs';
import path from 'path';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import {
  AudioPlayer,
  AudioPlayerStatus,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config/env';
import { logger } from '../utils/logger';

if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

let client: Client | null = null;
let connection: VoiceConnection | null = null;
let player: AudioPlayer | null = null;
let ready = false;
let leavingIntentionally = false;

export function isDiscordEnabled(): boolean {
  return Boolean(config.DISCORD_BOT_TOKEN && config.DISCORD_GUILD_ID && config.DISCORD_VOICE_CHANNEL_ID);
}

export function isVoiceConnected(): boolean {
  return ready;
}

export function getDiscordClient(): Client {
  if (!client) throw new Error('Discord client not initialized — call initDiscordVoice() first');
  return client;
}

async function joinChannel(): Promise<void> {
  const guild = await client!.guilds.fetch(config.DISCORD_GUILD_ID);

  connection = joinVoiceChannel({
    channelId: config.DISCORD_VOICE_CHANNEL_ID,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (leavingIntentionally) return;
    try {
      await Promise.race([
        entersState(connection!, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection!, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Discord is reconnecting the existing connection on its own — nothing to do.
    } catch {
      logger.warn('[discord] Voice connection dropped — rejoining channel');
      try { connection!.destroy(); } catch { /* ignore */ }
      await joinChannel();
      if (player) connection!.subscribe(player);
    }
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
}

export async function enterVoiceChannel(): Promise<void> {
  if (!isDiscordEnabled() || !client || ready) return;

  await joinChannel();

  if (!player) {
    player = createAudioPlayer();
    player.on('error', err => logger.error(`[discord] Player error: ${err.message}`));
  }
  connection!.subscribe(player);

  ready = true;
  logger.info('[discord] Joined voice channel — ready to stream episodes');
}

export function leaveVoiceChannel(): void {
  if (!ready && !connection) return;

  leavingIntentionally = true;
  try { player?.stop(true); } catch { /* ignore */ }
  try { connection?.destroy(); } catch { /* ignore */ }
  connection = null;
  ready = false;
  leavingIntentionally = false;

  logger.info('[discord] Left voice channel');
}

export async function initDiscordVoice(): Promise<void> {
  if (!isDiscordEnabled()) return;

  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

  await new Promise<void>((resolve, reject) => {
    client!.once(Events.ClientReady, () => resolve());
    client!.once('error', reject);
    client!.login(config.DISCORD_BOT_TOKEN).catch(reject);
  });

  logger.info(`[discord] Logged in as ${client.user?.tag}`);

  await enterVoiceChannel();
}

export async function playInVoiceChannel(audioPath: string): Promise<void> {
  if (!ready || !player) return;

  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
    logger.warn(`[discord] Skipping playback — empty/missing audio file: ${path.basename(audioPath)}`);
    return;
  }

  const resource = createAudioResource(audioPath, { inputType: StreamType.Arbitrary });

  return new Promise((resolve, reject) => {
    const onIdle = () => { cleanup(); resolve(); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    function cleanup() {
      player!.off(AudioPlayerStatus.Idle, onIdle);
      player!.off('error', onError);
    }

    player!.once(AudioPlayerStatus.Idle, onIdle);
    player!.once('error', onError);
    player!.play(resource);
  });
}
