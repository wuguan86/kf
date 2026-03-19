type EventMap = {
  'assistant-state-change': { isRunning: boolean; isConnecting: boolean };
  'assistant-toggle': void;
  'points-updated': void;
};

class EventBus {
  private target = new EventTarget();

  emit<K extends keyof EventMap>(event: K, detail?: EventMap[K]) {
    this.target.dispatchEvent(new CustomEvent(event, { detail }));
  }

  on<K extends keyof EventMap>(event: K, listener: (detail: EventMap[K]) => void) {
    const wrapper = (e: Event) => listener((e as CustomEvent).detail);
    this.target.addEventListener(event, wrapper);
    return () => this.target.removeEventListener(event, wrapper);
  }
}

export const eventBus = new EventBus();
