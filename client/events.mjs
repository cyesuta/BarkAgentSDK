import { EventEmitter } from 'node:events';

export class BarkEventBus extends EventEmitter {
  emit(event, data) {
    if (event === 'error' && this.listenerCount('error') === 0) return false;
    return super.emit(event, data);
  }
}