import { EventEmitter } from 'events';

const emitter = new EventEmitter();

export function signalNext(): void {
  emitter.emit('next');
}

export function waitForNext(): Promise<void> {
  return new Promise(resolve => emitter.once('next', resolve));
}
