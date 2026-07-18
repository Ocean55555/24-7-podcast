import { channels, createCustomChannel } from './channels';
import type { Channel } from './channels';
import { episodeMemory } from '../memory/episodeMemory';

// cybersecurity, ai-news, arxiv-cs
let _active: Channel = channels.find(c => c.id === 'ai-news')!;

export function getActiveChannel(): Channel {
  return _active;
}

export function switchChannel(id: string): Channel {
  const ch = channels.find(c => c.id === id);
  if (!ch) throw new Error(`Unknown channel: ${id}`);
  _active = ch;
  episodeMemory.reset();
  return _active;
}

export function setCustomChannel(topic: string): Channel {
  _active = createCustomChannel(topic);
  episodeMemory.reset();
  return _active;
}

export function listChannels(): Pick<Channel, 'id' | 'name' | 'hostName'>[] {
  return channels.map(({ id, name, hostName }) => ({ id, name, hostName }));
}
