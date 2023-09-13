import AsyncLock from "async-lock";

type ItemWithKey<T> = {
  key: number;
  item: T;
};

export class LiveCache<T> {
  private cache: Map<string, ItemWithKey<T>> = new Map();

  private estimateLock = new AsyncLock();

  run(
    id: string,
    infer: (c?: T) => T,
    estimateRun: (c: T) => Promise<void>,
    reconcileRun: () => Promise<void>,
  ) {
    const currentCache = this.cache.get(id);
    const key = currentCache?.key ? currentCache.key + 1 : 1;

    const data = infer(currentCache?.item);

    this.cache.set(id, { key, item: data });

    this.estimateLock.acquire(id, async () => {
      if (this.cache.get(id)?.key != key) {
        return;
      }

      await estimateRun(data);

      if (this.cache.get(id)?.key != key) {
        return;
      }

      await reconcileRun();

      if (this.cache.get(id)?.key != key) {
        return;
      }

      this.cache.delete(id);
    });
  }
}
