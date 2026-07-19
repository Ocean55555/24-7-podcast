import {
  ChannelType,
  Events,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { setCustomChannel, switchChannel } from '../config/activeChannel';
import { clearEpisodeQueue } from '../stream/episodeQueue';
import { pausePipeline, resumePipeline } from '../stream/pipelineState';
import { enterVoiceChannel, getDiscordClient, leaveVoiceChannel } from './voiceStreamer';

const GENERAL_CHANNEL_NAME = 'general';

// Fixed channel-switch commands: slash command name -> channel id (src/config/channels.ts)
const CHANNEL_COMMANDS: Record<string, string> = {
  cyber: 'cybersecurity',
  ai: 'ai-news',
  cs: 'arxiv-cs',
};

const MANAGED_COMMANDS = new Set(['topic', 'stop', 'start', ...Object.keys(CHANNEL_COMMANDS)]);

const commands = [
  new SlashCommandBuilder()
    .setName('topic')
    .setDescription('Switch the live channel to a custom topic')
    .addStringOption(opt =>
      opt.setName('text').setDescription('The topic the channel should cover').setRequired(true),
    ),
  new SlashCommandBuilder().setName('cyber').setDescription('Switch to the OWASP Cybersecurity channel'),
  new SlashCommandBuilder().setName('ai').setDescription('Switch to the AI & Tech News channel'),
  new SlashCommandBuilder().setName('cs').setDescription('Switch to the CS Research (ArXiv) channel'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop generating episodes and leave the voice channel'),
  new SlashCommandBuilder().setName('start').setDescription('Rejoin the voice channel and resume generating episodes'),
];

export async function registerCommands(): Promise<void> {
  const client = getDiscordClient();
  const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.application!.id, config.DISCORD_GUILD_ID),
      { body: commands.map(c => c.toJSON()) },
    );
    logger.info('[discord] Registered /topic, /cyber, /ai, /cs, /stop, /start commands');
  } catch (err) {
    logger.error(
      `[discord] Failed to register commands: ${(err as Error).message} — ` +
      'the bot invite may be missing the "applications.commands" OAuth2 scope',
    );
  }
}

export function listenForCommands(): void {
  const client = getDiscordClient();

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() || !MANAGED_COMMANDS.has(interaction.commandName)) return;

    const discordChannel = interaction.channel;
    const inGeneral = discordChannel?.type === ChannelType.GuildText
      && discordChannel.name.toLowerCase() === GENERAL_CHANNEL_NAME;

    if (!inGeneral) {
      await interaction.reply({
        content: `/${interaction.commandName} can only be used in #${GENERAL_CHANNEL_NAME}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (interaction.commandName) {
      case 'topic': {
        const text = interaction.options.getString('text', true);
        const newChannel = setCustomChannel(text);
        clearEpisodeQueue();
        logger.info(`[discord] /topic switched to custom channel: "${text}"`);
        await interaction.reply({
          content: `Switched to custom channel: "${newChannel.name}" — new episodes will cover this topic.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      case 'stop': {
        pausePipeline();
        leaveVoiceChannel();
        logger.info('[discord] /stop — paused episode generation and left voice channel');
        await interaction.reply({
          content: 'Stopped — left the voice channel and paused episode generation.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      case 'start': {
        resumePipeline();
        try {
          await enterVoiceChannel();
          logger.info('[discord] /start — resumed episode generation and rejoined voice channel');
          await interaction.reply({
            content: 'Started — rejoined the voice channel and resumed episode generation.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          logger.error(`[discord] /start failed to rejoin voice channel: ${(err as Error).message}`);
          await interaction.reply({
            content: `Resumed episode generation, but failed to rejoin the voice channel: ${(err as Error).message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      default: {
        const channelId = CHANNEL_COMMANDS[interaction.commandName];
        const newChannel = switchChannel(channelId);
        clearEpisodeQueue();
        logger.info(`[discord] /${interaction.commandName} switched channel to "${newChannel.name}"`);
        await interaction.reply({
          content: `Switched to channel: "${newChannel.name}"`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });
}
