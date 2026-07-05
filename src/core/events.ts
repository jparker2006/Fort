// A tiny typed event bus shared across engine systems.
// Systems subscribe to named events with typed payloads; on() returns an
// unsubscribe function.

export type Handler<T> = (payload: T) => void;

export class EventBus<M extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof M, Set<Handler<unknown>>>();

  on<K extends keyof M>(type: K, handler: Handler<M[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(type, handler);
  }

  off<K extends keyof M>(type: K, handler: Handler<M[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers that unsubscribe during dispatch do not mutate the set
    // mid-iteration.
    for (const handler of [...set]) {
      (handler as Handler<M[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Application-wide events. Tickets extend this type as they add systems.
// A type alias (not an interface) so it satisfies the Record constraint above.
export type AppEvents = {
  resize: { width: number; height: number };
  pause: { reason: string };
  resume: { reason: string };
};
