import { config } from '../config/env';
import { logger } from '../utils/logger';

interface OllamaResponse {
  message: { role: string; content: string };
}

export async function chat(system: string, user: string): Promise<string> {
  const url = `${config.LOCAL_LLM_URL}/api/chat`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.LOCAL_LLM_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as OllamaResponse;
  const text = data.message?.content ?? '';
  logger.debug(`LLM response length: ${text.length} chars`);
  return text;
}
