import Redis, { ChainableCommander, RedisOptions } from "ioredis";
import { isEmpty, isNil } from "lodash";

// TODO: later
const logger = console;

interface CacheConfig {
  username?: string;
  password?: string;
  port?: string | number;
  host: string;
  tlsEnabled?: boolean;
  env?: string;
}

export class Cache {
  // should be private, but we need to access it in tests
  public static instance: Cache | null = null;
  private redis: Redis | null = null;
  private isReady = false;
  private connectPromise: Promise<void> | null = null;
  private config: CacheConfig;

  private constructor(config: CacheConfig) {
    this.config = config;
  }

  private getHost(): string {
    return this.config.env === "test" ? "localhost" : this.config.host;
  }

  private getKey(key: string): string {
    return this.config.env === "test" ? `${this.config.env}:${key}` : key;
  }

  private getRedisConfig(): RedisOptions {
    const { username, password, port, tlsEnabled } = this.config;

    return {
      ...(!isEmpty(username) ? { username } : {}),
      ...(!isEmpty(password) ? { password } : {}),
      port: Number.parseInt(String(port ?? "6379"), 10),
      host: this.getHost(),
      retryStrategy(attempt: number) {
        const nextSleepTime = Math.min(
          2 ** attempt + Math.floor(Math.random() * 5000),
          3000
        );
        logger.warn("cache.retrying", { attempt, nextSleepTime });
        return attempt >= 5 ? null : nextSleepTime;
      },
      maxRetriesPerRequest: null,
      ...(!!tlsEnabled ? { tls: { rejectUnauthorized: false } } : {}),
      connectTimeout: 10000,
      disconnectTimeout: 2000,
      enableOfflineQueue: false,
    };
  }

  public static getInstance(config?: CacheConfig): Cache {
    if (!Cache.instance && !config) {
      throw new Error(
        "Cache is not initialized. Please provide configuration for the first call."
      );
    }

    if (!Cache.instance && config) {
      Cache.instance = new Cache(config);
    }

    return Cache.instance!;
  }

  private setupListeners(redis: Redis): void {
    redis.on("connect", () => logger.info("cache.connected"));
    redis.on("ready", () => {
      logger.info("cache.ready");
    });
    redis.on("error", (error: Error) => {
      logger.error("cache.error", { error });
    });
    redis.on("close", () => {
      logger.info("cache.closed");
      this.isReady = false;
    });
    redis.on("reconnecting", () => logger.info("cache.reconnecting"));
    redis.on("end", () => {
      logger.info("cache.ended");
    });
  }

  public async connect(): Promise<void> {
    if (this.isReady && this.redis) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        this.redis = new Redis(this.getRedisConfig());

        const timeoutId = setTimeout(() => {
          reject(new Error("Connection timeout"));
          this.redis?.disconnect();
        }, 5000);

        this.redis.on("ready", () => {
          clearTimeout(timeoutId);
          this.isReady = true;
          this.setupListeners(this.redis as Redis);
          resolve();
        });

        this.redis.on("error", (error) => {
          clearTimeout(timeoutId);
          this.isReady = false;
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.redis) {
      this.isReady = false;
      await this.redis.quit();
      this.redis = null;
    }
    Cache.instance = null; // Reset singleton on shutdown
  }

  private getConnection(): Redis {
    if (this.isReady && this.redis) {
      return this.redis;
    }
    throw new Error("Redis cache is not connected");
  }

  public async set(
    rawKey: string,
    value: unknown,
    ttl?: number
  ): Promise<void> {
    if (isNil(value)) {
      throw new Error("Value is null or undefined");
    }
    const redis = this.getConnection();
    const v = JSON.stringify(value);
    const key = this.getKey(rawKey);
    await (ttl ? redis.setex(key, ttl, v) : redis.set(key, v));
    logger.debug("cache.set.successfully", { key: rawKey });
  }

  public async get<T = unknown>(rawKey: string): Promise<T | undefined> {
    const redis = this.getConnection();
    const key = this.getKey(rawKey);
    const value = await redis.get(key);

    if (isNil(value)) {
      logger.info("cache.get.miss", { key: rawKey });
      return undefined;
    }

    logger.info("cache.get.hit", { key: rawKey });
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn("cache.get.parse_failed", { key: rawKey, error });
      return value as T;
    }
  }

  public async keys(pattern = "*"): Promise<string[]> {
    const redis = this.getConnection();
    return redis.keys(this.getKey(pattern));
  }

  public async del(key: string): Promise<void> {
    const redis = this.getConnection();
    await redis.del(this.getKey(key));
  }

  // For testing purposes
  public isConnected(): boolean {
    return this.isReady && this.redis !== null;
  }

  // Should not be used outside this class, it's public just for testing purposes
  public async executePipeline<T = any>(
    operations: (pipeline: ChainableCommander) => void
  ): Promise<[Error | null, T][]> {
    const redis = this.getConnection();
    const pipeline = redis.pipeline();

    operations(pipeline);

    try {
      const results = await pipeline.exec();
      logger.debug("cache.pipeline.executed_successfully", {
        operationsCount: pipeline.length,
      });
      return results as [Error | null, T][];
    } catch (error) {
      logger.error("cache.pipeline.execution_failed", { error });
      throw error;
    }
  }

  public async setBulk(
    items: { key: string; value: unknown; ttl?: number }[]
  ): Promise<void> {
    const results = await this.executePipeline<"OK">((pipeline) => {
      for (const { key, value, ttl } of items) {
        const serializedValue = JSON.stringify(value);
        const formattedKey = this.getKey(key);
        if (ttl) {
          pipeline.setex(formattedKey, ttl, serializedValue);
        } else {
          pipeline.set(formattedKey, serializedValue);
        }
      }
    });

    // Check for errors in the results
    const errors = results.filter(([err]) => err !== null);
    if (errors.length > 0) {
      logger.error("cache.set_bulk.partial_failure", {
        errorCount: errors.length,
        totalCount: items.length,
      });
      throw new Error(
        `Failed to set ${errors.length} out of ${items.length} items`
      );
    }

    logger.debug("cache.set_bulk.successfully", { itemCount: items.length });
  }
}

/**
 * Get the cache instance. Configuration is required for the first call.
 * Subsequent calls will return the existing instance regardless of the configuration provided.
 *
 * @throws {Error} If no configuration is provided and cache is not initialized
 */
export function cacheInstance(config?: CacheConfig): Cache {
  return Cache.getInstance(config);
}

// Also export the config type for users of the package
export type { CacheConfig };
