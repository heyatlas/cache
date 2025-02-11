import { Logger } from "@heyatlas/logger";
import { Cache } from "./cache";

export async function flushCache(cache: Cache): Promise<void> {
  const testKeys = (await cache.keys()).map((key) => key.replace(/^test:/, ""));
  await Promise.all(testKeys.map((key) => cache.del(key)));
}

// Default logger configuration
export function createDefaultLogger() {
  return new Logger({
    name: "cache",
    test: {
      streams: [{ type: "stdout", level: "fatal" }],
    },
    staging: {
      streams: [{ type: "stdout", level: "info" }],
    },
    production: {
      streams: [{ type: "stdout", level: "info" }],
    },
  });
}
