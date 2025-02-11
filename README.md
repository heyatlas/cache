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
