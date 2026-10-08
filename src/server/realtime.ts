import "server-only";

export type SpaceEvent = {
  type: string;
  actorId: string | null;
};

type Listener = (event: SpaceEvent) => void;

const globalForBus = globalThis as unknown as {
  __betweenBus?: Map<string, Set<Listener>>;
};

function bus() {
  if (!globalForBus.__betweenBus) globalForBus.__betweenBus = new Map();
  return globalForBus.__betweenBus;
}

export function publish(spaceId: string, event: SpaceEvent) {
  const listeners = bus().get(spaceId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error(error);
    }
  }
}

export function subscribe(spaceId: string, listener: Listener) {
  const map = bus();
  let set = map.get(spaceId);
  if (!set) {
    set = new Set();
    map.set(spaceId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) map.delete(spaceId);
  };
}
