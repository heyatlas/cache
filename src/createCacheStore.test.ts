import { Logger } from "@heyatlas/logger";
import { cacheInstance, CacheConfig } from "./cache";
import { CacheStore, createCacheStore } from "./createCacheStore";
import { flushCache } from "./utils";

const testConfig: CacheConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USERNAME || "",
  password: process.env.REDIS_PASSWORD || "admin",
};

describe("createCacheStore", () => {
  let cacheStore: CacheStore;

  beforeAll(async () => {
    // Initialize cache with config first
    const cache = cacheInstance(testConfig);
    await cache.connect();
    cacheStore = createCacheStore({ namespace: "test-namespace" });
  });

  afterAll(async () => {
    await cacheInstance(testConfig).shutdown();
  });

  beforeEach(async () => {
    await flushCache(cacheInstance(testConfig));
  });

  describe("Configuration", () => {
    it("should use custom logger if provided", async () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as unknown as Logger;

      const store = createCacheStore({
        namespace: "test-namespace",
        logger: mockLogger,
      });

      await store.saveItem("test-key", "test-value");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "test_namespace.save_item.success",
        expect.any(Object)
      );
    });

    it("should use default TTL if not provided in saveItem", async () => {
      const customTTL = 2; // 2 seconds instead of 60
      const store = createCacheStore({
        namespace: "test-namespace",
        defaultTTL: customTTL,
      });

      await store.saveItem("test-key", "test-value");
      // Wait for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await store.isNewItem("test-key")).toBe(false);

      // Wait for remaining time plus buffer
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await store.isNewItem("test-key")).toBe(true);
    }, 10000); // Add jest timeout of 10 seconds
  });

  describe("Error Handling", () => {
    beforeEach(async () => {
      // Ensure cache is connected before each test
      const cache = cacheInstance(testConfig);
      if (!cache.isConnected()) {
        await cache.connect();
      }
    });

    it("should handle JSON parsing errors in isNewItem", async () => {
      // Force invalid JSON directly in Redis
      const redis = cacheInstance(testConfig);
      await redis.set(
        "test:test-namespace:invalid-json", // Add test: prefix for test environment
        "{invalid-json"
      );

      const isNew = await cacheStore.isNewItem("invalid-json");
      expect(isNew).toBe(true); // Should treat corrupted data as non-existent
    });

    it("should propagate errors from saveItem", async () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
      } as unknown as Logger;

      const store = createCacheStore({
        namespace: "test-namespace",
        logger: mockLogger,
      });

      // Simulate a Redis error by disconnecting
      await cacheInstance(testConfig).shutdown();

      await expect(store.saveItem("test-key", "test-value")).rejects.toThrow(
        "Failed to save item"
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        "test_namespace.save_item.error",
        expect.any(Object)
      );

      // Reconnect for subsequent tests
      await cacheInstance(testConfig).connect();
    });
  });

  describe("Namespace Handling", () => {
    it("should return the correct namespace", () => {
      const namespace = "custom-namespace";
      const store = createCacheStore({ namespace });
      expect(store.getNamespace()).toBe(namespace);
    });

    it("should handle special characters in namespace", async () => {
      const store = createCacheStore({ namespace: "test/namespace:special" });
      await store.saveItem("key", "value");
      expect(await store.isNewItem("key")).toBe(false);
    });

    it("should handle empty values correctly", async () => {
      await cacheStore.saveItem("empty-string", "");
      expect(await cacheStore.isNewItem("empty-string")).toBe(false);
    });
  });

  it("should correctly identify a new item", async () => {
    const isNew = await cacheStore.isNewItem("test-key");
    expect(isNew).toBe(true);
  });

  it("should correctly save and retrieve an item", async () => {
    await cacheStore.saveItem("test-key", "test-value");
    const isNew = await cacheStore.isNewItem("test-key");
    expect(isNew).toBe(false);
  });

  it("should handle custom TTL", async () => {
    await cacheStore.saveItem("test-key", "test-value", 1); // 1 second TTL
    expect(await cacheStore.isNewItem("test-key")).toBe(false);

    // Wait for the item to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(await cacheStore.isNewItem("test-key")).toBe(true);
  });

  it("should use different namespaces for different stores", async () => {
    const store1 = createCacheStore({ namespace: "store1" });
    const store2 = createCacheStore({ namespace: "store2" });

    await store1.saveItem("key", "value1");
    await store2.saveItem("key", "value2");

    expect(await store1.isNewItem("key")).toBe(false);
    expect(await store2.isNewItem("key")).toBe(false);

    // Check that the keys are actually different in the cache
    const value1 = await cacheInstance(testConfig).get("store1:key");
    const value2 = await cacheInstance(testConfig).get("store2:key");

    expect(value1).toBe("value1");
    expect(value2).toBe("value2");
  });

  it("should handle errors gracefully", async () => {
    // Simulate a cache error by disconnecting
    await cacheInstance(testConfig).shutdown();

    // isNewItem should return true when there's an error
    const isNew = await cacheStore.isNewItem("test-key");
    expect(isNew).toBe(true);

    // saveItem should throw an error
    await expect(cacheStore.saveItem("test-key", "test-value")).rejects.toThrow(
      "Failed to save item"
    );

    // Reconnect for subsequent tests
    await cacheInstance(testConfig).connect();
  });
});
