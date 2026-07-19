let paused = false;

export function pausePipeline(): void {
  paused = true;
}

export function resumePipeline(): void {
  paused = false;
}

export function isPipelinePaused(): boolean {
  return paused;
}
