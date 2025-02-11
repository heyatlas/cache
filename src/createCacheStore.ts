import { Logger } from "@heyatlas/logger";
import { snakeCase } from "lodash";
import { cacheInstance } from "./cache";
import { createDefaultLogger } from "./utils";
interface CacheStore {
  isNewItem(key: string): Promise<boolean>;
  saveItem(key: string, value: string, ttl?: number): Promise<void>;
  getNamespace(): string;
}

interface CacheStoreOptions {
  // The namespace to use for the cache store
  namespace: string;
  // If not provided, the default TTL will be 24 hours
  defaultTTL?: number;
  // If not provided, a default logger will be created
  logger?: Logger;
}

function createCacheStore(options: CacheStoreOptions): CacheStore {
  const { namespace, defaultTTL = 60 * 60 * 24 } = options; // Default TTL: 24 hours
  const logger = options.logger || createDefaultLogger();
  const storeName = snakeCase(namespace);
  return {
    getNamespace(): string {
      return namespace;
    },
    async isNewItem(key: string): Promise<boolean> {
      try {
        const fullKey = `${namespace}:${key}`;
        const existingItem = await cacheInstance().get<string>(fullKey);
        return existingItem === undefined;
      } catch (error) {
        logger.error(`${storeName}.is_new_item.error`, { key, error });
        // In case of error, we assume it's a new item to avoid missing important updates
        return true;
      }
    },

    async saveItem(
      key: string,
      value: string,
      ttl: number = defaultTTL
    ): Promise<void> {
      try {
        const fullKey = `${namespace}:${key}`;
        await cacheInstance().set(fullKey, value, ttl);
        logger.info(`${storeName}.save_item.success`, { key, value });
      } catch (error) {
        logger.error(`${storeName}.save_item.error`, { key, value, error });
        throw new Error(`Failed to save item: ${(error as Error).message}`);
      }
    },
  };
}

export { CacheStore, CacheStoreOptions, createCacheStore };
