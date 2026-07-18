import { chat } from '../llm/localLLM';
import { logger } from '../utils/logger';
import { getActiveChannel } from '../config/activeChannel';
import type { SourceItem } from '../collectors/rssCollector';
import type { GeneratedScript } from './scriptAgent';

function buildUserMessage(topic: SourceItem, draft: GeneratedScript): string {
  const sourceText = `
Title: ${topic.title}
Source: ${topic.source}
Published: ${topic.publishedAt}

Summary: ${topic.summary}

Content: ${topic.content}
`.trim();

  return `Fact-check the following script against the source material.

SOURCE TEXT:
${sourceText}

SCRIPT TO VERIFY:
Title: ${draft.title}

Script: ${draft.script}

Bullets:
${draft.bullets.map(b => `- ${b}`).join('\n')}

Review for:
1. Factual accuracy against the source
2. Technical correctness of claims
3. No exaggeration or unsupported speculation

Return the corrected version in the SAME format:

TITLE: [title]

SCRIPT: [corrected script]

BULLETS:
- [bullet 1]
- [bullet 2]
- [bullet 3]
- [bullet 4]`;
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

export async function factCheckScript(
  draft: GeneratedScript,
  topic: SourceItem,
): Promise<GeneratedScript> {
  const channel = getActiveChannel();
  logger.info(`Fact-checking script: "${draft.title}"`);
  const text = await chat(channel.factCheckPrompt, buildUserMessage(topic, draft));
  const result = parseResponse(text, draft);
  logger.info(`Fact-check complete: "${result.title}"`);
  return result;
}
