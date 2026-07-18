const queue: string[] = [];

export function addCustomTopic(topic: string): void {
  queue.push(topic.trim());
}

export function shiftCustomTopic(): string | null {
  return queue.shift() ?? null;
}

export function getCustomTopics(): string[] {
  return [...queue];
}
