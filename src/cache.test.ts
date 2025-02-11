import { Cache, CacheConfig, cacheInstance } from "./cache";
import { flushCache } from "./utils";

const testConfig: CacheConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USERNAME || "",
  password: process.env.REDIS_PASSWORD || "admin",
};

// Remove global beforeAll since we're handling connections per test
beforeAll(() => {
  Cache.instance = null;
});

let activeCache: Cache | null = null;

// Track the active cache instance
function trackCache(cache: Cache) {
  activeCache = cache;
  return cache;
}

// Update the cleanup function
async function cleanupRedisConnections() {
  if (activeCache?.isConnected()) {
    await activeCache.shutdown();
  }
  if (Cache.instance?.isConnected()) {
    await Cache.instance.shutdown();
  }
  activeCache = null;
  Cache.instance = null;
}

// Add forceCleanup parameter for final cleanup
afterAll(async () => {
  await cleanupRedisConnections();
  // Force disconnect any remaining Redis connections
  await new Promise((resolve) => {
    if (process.env.NODE_ENV === "test") {
      resolve(undefined);
    }
  });
}, 1000); // Add timeout to ensure cleanup completes

describe("Cache Integration Tests", () => {
  afterEach(async () => {
    await cleanupRedisConnections();
  });

  describe("Singleton and Connection", () => {
    let cache: Cache;
    let originalInstance: Cache | null;

    beforeEach(async () => {
      await cleanupRedisConnections();
      originalInstance = Cache.instance;
      cache = trackCache(cacheInstance(testConfig));
      await cache.connect();
      await flushCache(cache);
    });

    afterEach(async () => {
      await cleanupRedisConnections();
    });

    it("should return the same instance", () => {
      const instance1 = cacheInstance(testConfig);
      const instance2 = cacheInstance(testConfig);
      expect(instance1).toBe(instance2);
    });

    it("should throw error when getting instance without config before initialization", async () => {
      Cache.instance = null; // Reset singleton for this test
      expect(() => cacheInstance()).toThrow(
        "Cache is not initialized. Please provide configuration for the first call."
      );
      // Don't need to cleanup as afterEach will restore original instance
    });

    it("should reuse existing connection", async () => {
      const initialConnection = cache.isConnected();
      await cache.connect();
      expect(cache.isConnected()).toBe(true);
      expect(initialConnection).toBe(true);
    });
  });

  describe("Set and Get", () => {
    let cache: Cache;

    beforeEach(async () => {
      cache = cacheInstance(testConfig);
      await cache.connect();
      await flushCache(cache);
    });

    it("should set and get a string value", async () => {
      await cache.set("testKey", "testValue");
      const result = await cache.get("testKey");
      expect(result).toBe("testValue");
    });

    it("should set and get an object value", async () => {
      const testObject = { name: "Test", value: 123 };
      await cache.set("testObjectKey", testObject);
      const result = await cache.get("testObjectKey");
      expect(result).toEqual(testObject);
    });

    it("should return undefined for non-existent key", async () => {
      const result = await cache.get("nonExistentKey");
      expect(result).toBeUndefined();
    });

    it("should handle TTL", async () => {
      await cache.set("ttlKey", "ttlValue", 1);
      let result = await cache.get("ttlKey");
      expect(result).toBe("ttlValue");

      await new Promise((resolve) => setTimeout(resolve, 1100));

      result = await cache.get("ttlKey");
      expect(result).toBeUndefined();
    });

    it("should throw error when setting null or undefined", async () => {
      await expect(cache.set("nullKey", null)).rejects.toThrow(
        "Value is null or undefined"
      );
      await expect(cache.set("undefinedKey", undefined)).rejects.toThrow(
        "Value is null or undefined"
      );
    });
  });

  describe("Delete", () => {
    let cache: Cache;

    beforeEach(async () => {
      cache = cacheInstance(testConfig);
      await cache.connect();
      await flushCache(cache);
    });

    it("should delete a key", async () => {
      await cache.set("deleteKey", "deleteValue");
      await cache.del("deleteKey");
      const result = await cache.get("deleteKey");
      expect(result).toBeUndefined();
    });

    it("should not throw when deleting non-existent key", async () => {
      await expect(cache.del("nonExistentKey")).resolves.not.toThrow();
    });
  });

  describe("Keys", () => {
    let cache: Cache;

    beforeEach(async () => {
      cache = cacheInstance(testConfig);
      await cache.connect();
      await flushCache(cache);
    });

    it("should return all keys matching pattern", async () => {
      await cache.set("prueba1", "value1");
      await cache.set("prueba2", "value2");
      await cache.set("other", "value3");

      const keys = await cache.keys("prueba*");
      expect(keys.length).toBe(2);
      // in test environment, the keys are prefixed with 'test:'
      expect(keys).toContain("test:prueba1");
      expect(keys).toContain("test:prueba2");
    });
  });

  describe("Error Handling", () => {
    let originalInstance: Cache | null;

    beforeEach(async () => {
      originalInstance = Cache.instance;
    });

    afterEach(async () => {
      // Clean up any test instances and restore original
      if (Cache.instance && Cache.instance !== originalInstance) {
        await Cache.instance.shutdown();
      }
      Cache.instance = originalInstance;
    });

    it("should throw error when trying to use cache before connecting", async () => {
      Cache.instance = null;
      const newCache = cacheInstance({ ...testConfig, host: "other-host" });
      await expect(newCache.get("someKey")).rejects.toThrow(
        "Redis cache is not connected"
      );
      // Don't need explicit cleanup as afterEach will handle it
    });

    it("should handle reconnection after shutdown", async () => {
      const cache = cacheInstance(testConfig);
      await cache.connect();

      await cache.shutdown();
      expect(cache.isConnected()).toBe(false);

      await expect(cache.get("someKey")).rejects.toThrow(
        "Redis cache is not connected"
      );

      await cache.connect();
      expect(cache.isConnected()).toBe(true);

      await cache.set("reconnectKey", "reconnectValue");
      const result = await cache.get("reconnectKey");
      expect(result).toBe("reconnectValue");

      // Clean up this test's connection
      await cache.shutdown();
    });
  });

  describe("Pipeline Operations", () => {
    let cache: Cache;

    beforeEach(async () => {
      await cleanupRedisConnections();
      cache = trackCache(cacheInstance(testConfig));
      await cache.connect();
    });

    afterEach(async () => {
      await cleanupRedisConnections();
      jest.restoreAllMocks();
    });

    it("should execute pipeline operations successfully", async () => {
      const results = await cache.executePipeline<string | number>(
        (pipeline) => {
          pipeline.set("test:key1", "value1");
          pipeline.incr("test:counter");
          pipeline.get("test:key1");
        }
      );

      expect(results.length).toBe(3);
      expect(results[0]).toEqual([null, "OK"]);
      expect(results[1]).toEqual([null, 1]);
      expect(results[2]).toEqual([null, "value1"]);

      const counterValue = await cache.get("counter");
      expect(counterValue).toBe(1);
    });

    it("should handle errors in pipeline operations", async () => {
      const results = await cache.executePipeline<any>((pipeline) => {
        pipeline.set("key1", "value1");
        pipeline.hget("key1", "field"); // This will cause an error as key1 is not a hash
      });

      expect(results.length).toBe(2);
      expect(results[0]).toEqual([null, "OK"]);
      expect(results[1][0]).toBeInstanceOf(Error);
    });
  });

  describe("setBulk", () => {
    let cache: Cache;

    beforeEach(async () => {
      cache = trackCache(cacheInstance(testConfig));
      await cache.connect();
      await flushCache(cache);
    });

    it("should set multiple items successfully", async () => {
      const items = [
        { key: "bulk1", value: "value1" },
        { key: "bulk2", value: { nested: "object" } },
        { key: "bulk3", value: "value3", ttl: 3600 },
      ];

      await cache.setBulk(items);

      const result1 = await cache.get("bulk1");
      const result2 = await cache.get("bulk2");
      const result3 = await cache.get("bulk3");

      expect(result1).toBe("value1");
      expect(result2).toEqual({ nested: "object" });
      expect(result3).toBe("value3");

      // Check if TTL is set for bulk3
      const ttl = await cache.executePipeline<number>((pipeline) => {
        pipeline.ttl("test:bulk3");
      });
      expect(ttl[0][1]).toBeGreaterThan(0);
      expect(ttl[0][1]).toBeLessThanOrEqual(3600);
    });

    it("should throw an error if any item fails to set", async () => {
      // Mock the executePipeline method to simulate a partial failure
      const mockExecutePipeline = jest.spyOn(cache, "executePipeline");
      mockExecutePipeline.mockResolvedValueOnce([
        [null, "OK"],
        [new Error("Simulated failure"), null],
        [null, "OK"],
      ]);

      const items = [
        { key: "bulk1", value: "value1" },
        { key: "bulk2", value: "value2" },
        { key: "bulk3", value: "value3" },
      ];

      await expect(cache.setBulk(items)).rejects.toThrow(
        "Failed to set 1 out of 3 items"
      );

      mockExecutePipeline.mockRestore();
    });

    it("should handle an empty array of items", async () => {
      await expect(cache.setBulk([])).resolves.not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    beforeEach(async () => {
      await cleanupRedisConnections();
      jest.clearAllMocks();
    });

    afterEach(async () => {
      await cleanupRedisConnections();
      jest.restoreAllMocks();
    });

    it("should handle non-JSON values in get", async () => {
      const cache = trackCache(cacheInstance(testConfig));
      await cache.connect();

      // Mock Redis get method
      jest.spyOn(cache["redis"]!, "get").mockResolvedValue("not-json");

      const result = await cache.get("invalid-json");
      expect(result).toBe("not-json");
      jest.restoreAllMocks();
    });

    it("should handle retry strategy", async () => {
      const cache = cacheInstance(testConfig);
      await cache.connect();
      const config = cache["getRedisConfig"]();
      const retryDelay = config.retryStrategy!(3);
      expect(retryDelay).toBeLessThanOrEqual(3000);
      expect(retryDelay).toBeGreaterThan(0);

      const maxRetryDelay = config.retryStrategy!(6);
      expect(maxRetryDelay).toBeNull();
    });

    it("should handle TLS configuration", () => {
      const tlsConfig: CacheConfig = {
        ...testConfig,
        tlsEnabled: true,
      };

      const cache = cacheInstance(tlsConfig);
      const config = cache["getRedisConfig"]();
      expect(config.tls).toEqual({ rejectUnauthorized: false });
    });
  });
});
