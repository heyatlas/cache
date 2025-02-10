import { Cache } from "./cache";

export async function flushCache(cache: Cache): Promise<void> {
  const testKeys = (await cache.keys()).map((key) => key.replace(/^test:/, ""));
  await Promise.all(testKeys.map((key) => cache.del(key)));
}
