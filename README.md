# @heyatlas/cache

A Redis cache implementation with TypeScript support, automatic JSON handling, and connection management.

## Features

- 🔄 Singleton pattern for consistent cache access
- 📦 Automatic JSON serialization/deserialization
- ⏱️ TTL support for cache entries
- 🚀 Bulk operations support
- 📝 Custom logger injection
- 🔍 Pattern-based key search
- 🔄 Connection retry strategy
- 🧪 Test environment support

## Installation

```bash
npm install @heyatlas/cache
```

## Usage

### Basic Usage

```typescript
import { cacheInstance } from "@heyatlas/cache";

// Initialize cache
const cache = cacheInstance({
  host: "redis.example.com",
  port: 6379,
  username: "user", // optional
  password: "pass", // optional
});

// Connect to Redis
await cache.connect();

// Set a value
await cache.set("myKey", { foo: "bar" });

// Get a value
const value = await cache.get("myKey");
// value = { foo: "bar" }

// Set with TTL (in seconds)
await cache.set("tempKey", "value", 60);

// Delete a key
await cache.del("myKey");
```

### Custom Logger

```typescript
import { Logger } from "@heyatlas/logger";
import { cacheInstance } from "@heyatlas/cache";

const logger = new Logger({
  name: "my-cache",
  // ... logger configuration
});

const cache = cacheInstance({
  host: "redis.example.com",
  logger: logger,
});
```

### Bulk Operations

```typescript
const items = [
  { key: "key1", value: "value1" },
  { key: "key2", value: { nested: "object" } },
  { key: "key3", value: "value3", ttl: 3600 },
];

await cache.setBulk(items);
```

### Pattern-based Key Search

```typescript
// Find all keys matching a pattern
const keys = await cache.keys("user:*");
```

### Pipeline Operations

```typescript
const results = await cache.executePipeline<string | number>((pipeline) => {
  pipeline.set("key1", "value1");
  pipeline.incr("counter");
  pipeline.get("key1");
});
```

## Cache Store Usage

The cache store provides a higher-level abstraction with namespace isolation and simplified interface.

### Basic Usage

```typescript
import { createCacheStore } from "@heyatlas/cache";

// Create a store with a namespace
const userStore = createCacheStore({
  namespace: "users",
  defaultTTL: 3600, // optional, in seconds
});

// Check if item exists in cache
const isNew = await userStore.isNewItem("user-123");

// Save item to cache
await userStore.saveItem("user-123", {
  name: "John Doe",
  email: "john@example.com",
});

// Save with custom TTL (overrides default)
await userStore.saveItem("user-456", userData, 1800);
```

### Multiple Stores

Each store operates independently with its own namespace:

```typescript
// Create separate stores for different features
const userStore = createCacheStore({ namespace: "users" });
const productStore = createCacheStore({ namespace: "products" });
const sessionStore = createCacheStore({
  namespace: "sessions",
  defaultTTL: 1800, // 30 minutes
});

// Each store manages its own keys
await userStore.saveItem("123", userData);
await productStore.saveItem("123", productData);
// These don't conflict despite same key
```

### Store Configuration

```typescript
interface CacheStoreOptions {
  // Required unique namespace for this store
  namespace: string;

  // Optional default TTL in seconds
  defaultTTL?: number;

  // Optional custom logger
  logger?: Logger;
}
```

The store automatically handles:

- Namespace prefixing for keys
- JSON serialization/deserialization
- TTL management
- Connection lifecycle

## Configuration

| Option     | Type             | Required | Description                |
| ---------- | ---------------- | -------- | -------------------------- |
| host       | string           | Yes      | Redis host                 |
| port       | string \| number | No       | Redis port (default: 6379) |
| username   | string           | No       | Redis username             |
| password   | string           | No       | Redis password             |
| tlsEnabled | boolean          | No       | Enable TLS connection      |
| logger     | Logger           | No       | Custom logger instance     |

## Testing

The cache automatically prefixes keys with 'test:' when NODE_ENV is set to 'test'.
This helps isolate test data from production data.

```typescript
const testCache = cacheInstance({
  host: "localhost",
});

// With NODE_ENV=test
await testCache.set("key", "value");
// Actual key in Redis: 'test:key'
```

## Error Handling

The cache implements various error handling strategies:

- Connection retry with exponential backoff
- Automatic reconnection on connection loss
- Proper error propagation for failed operations
- Validation for null/undefined values

```typescript
try {
  await cache.set("key", null);
} catch (error) {
  // Throws: "Value is null or undefined"
}
```

## License

MIT
