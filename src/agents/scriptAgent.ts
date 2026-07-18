import { chat } from '../llm/localLLM';
import { logger } from '../utils/logger';
import { getActiveChannel } from '../config/activeChannel';
import type { SourceItem } from '../collectors/rssCollector';

export interface GeneratedScript {
  title: string;
  script: string;
  bullets: string[];
}

function buildUserMessage(topic: SourceItem): string {
  const sourceText = `
Title: ${topic.title}
Source: ${topic.source}
Published: ${topic.publishedAt}
URL: ${topic.url}

Summary: ${topic.summary}

Content: ${topic.content}
`.trim();

  return `Write a 60-90 second spoken script for the following news story.

SOURCE TEXT:
${sourceText}

Your response MUST follow this exact format:

TITLE: [A compelling broadcast-style title]

SCRIPT: [The full spoken script, written naturally for text-to-speech. 150-200 words.]

BULLETS:
- [Key point 1]
- [Key point 2]
- [Key point 3]
- [Key point 4]`;
}

function parseResponse(text: string): GeneratedScript {
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/i);
  const scriptMatch = text.match(/SCRIPT:\s*([\s\S]+?)(?:\nBULLETS:|$)/i);
  const bulletsMatch = text.match(/BULLETS:\s*([\s\S]+?)$/i);

  const title = titleMatch ? titleMatch[1].trim() : 'News Update';
  const script = scriptMatch ? scriptMatch[1].trim() : text.trim();

  const bullets: string[] = [];
  if (bulletsMatch) {
    for (const line of bulletsMatch[1].split('\n')) {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned) bullets.push(cleaned);
    }
  }

  return { title, script, bullets };
}

export async function generateScriptFromTopic(topicDescription: string): Promise<GeneratedScript> {
  logger.info(`Generating script from custom topic: ${topicDescription}`);
  const channel = getActiveChannel();
  const userMessage = `Write a 60-90 second spoken script about the following topic.

TOPIC: ${topicDescription}

Your response MUST follow this exact format:

TITLE: [A compelling broadcast-style title]

SCRIPT: [The full spoken script, written naturally for text-to-speech. 150-200 words.]

BULLETS:
- [Key point 1]
- [Key point 2]
- [Key point 3]
- [Key point 4]`;

  const text = await chat(channel.scriptPrompt, userMessage);
  const result = parseResponse(text);
  logger.info(`Script generated: "${result.title}" (${result.script.split(' ').length} words)`);
  return result;
}

export async function generateScript(topic: SourceItem): Promise<GeneratedScript> {
  logger.info(`Generating script for: ${topic.title}`);
  const channel = getActiveChannel();
  const text = await chat(channel.scriptPrompt, buildUserMessage(topic));
  const result = parseResponse(text);
  logger.info(`Script generated: "${result.title}" (${result.script.split(' ').length} words)`);
  return result;
}
