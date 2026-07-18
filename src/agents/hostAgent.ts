import { chat } from '../llm/localLLM';
import { logger } from '../utils/logger';
import { getActiveChannel } from '../config/activeChannel';
import type { GeneratedScript } from './scriptAgent';

function buildUserMessage(script: GeneratedScript, hostName: string): string {
  return `Rewrite the following script in ${hostName}'s voice. Keep all the facts. Only change the tone and style.

Title: ${script.title}

Script: ${script.script}

Return the result in this exact format:

TITLE: [title — you may refine it slightly to match ${hostName}'s voice]

SCRIPT: [rewritten script in ${hostName}'s voice]

BULLETS:
${script.bullets.map(b => `- ${b}`).join('\n')}`;
}

function parseResponse(text: string, original: GeneratedScript): GeneratedScript {
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/i);
  const scriptMatch = text.match(/SCRIPT:\s*([\s\S]+?)(?:\nBULLETS:|$)/i);
  const bulletsMatch = text.match(/BULLETS:\s*([\s\S]+?)$/i);

  const title = titleMatch ? titleMatch[1].trim() : original.title;
  const script = scriptMatch ? scriptMatch[1].trim() : original.script;

  const bullets: string[] = [];
  if (bulletsMatch) {
    for (const line of bulletsMatch[1].split('\n')) {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned) bullets.push(cleaned);
    }
  }

  return {
    title: title || original.title,
    script: script || original.script,
    bullets: bullets.length > 0 ? bullets : original.bullets,
  };
}

export async function applyHostPersonality(script: GeneratedScript): Promise<GeneratedScript> {
  const channel = getActiveChannel();
  logger.info(`Applying ${channel.hostName} personality to: "${script.title}"`);
  const text = await chat(channel.hostPrompt, buildUserMessage(script, channel.hostName));
  const result = parseResponse(text, script);
  logger.info(`Host personality applied: "${result.title}"`);
  return result;
}
