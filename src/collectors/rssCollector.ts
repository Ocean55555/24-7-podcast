import Parser from 'rss-parser';
import { logger } from '../utils/logger';

export interface SourceItem {
  title: string;
  url: string;
  summary: string;
  content: string;
  publishedAt: string;
  source: string;
}

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (AI Livestream Bot/1.0)' },
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(name: string, url: string): Promise<SourceItem[]> {
  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items ?? []).slice(0, 10).map(item => ({
      title: item.title ?? 'Untitled',
      url: item.link ?? url,
      summary: stripHtml(item.contentSnippet ?? item.summary ?? '').slice(0, 500),
      content: stripHtml(item.content ?? item.summary ?? '').slice(0, 2000),
      publishedAt: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
      source: name,
    }));
    logger.info(`  ${name}: ${items.length} items`);
    return items;
  } catch (err) {
    logger.warn(`  ${name}: FAILED — ${(err as Error).message}`);
    return [];
  }
}

export async function collectRSS(
  feeds: ReadonlyArray<{ name: string; url: string }>,
): Promise<SourceItem[]> {
  logger.info(`Collecting from ${feeds.length} RSS feeds...`);

  const results = await Promise.allSettled(
    feeds.map(f => fetchFeed(f.name, f.url)),
  );

  const items: SourceItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }

  // Sort newest first, deduplicate by URL
  const seen = new Set<string>();
  const unique = items
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

  logger.info(`Collected ${unique.length} unique items`);
  return unique;
}
