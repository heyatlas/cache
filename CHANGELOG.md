# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-02-11

### Added

- Cache store abstraction with namespacing support
- New `createCacheStore` API for namespace isolation
- Configurable default TTL per store
- Simplified cache interaction through store interface

### Features

- Namespace isolation between different cache stores
- Multiple independent stores with different configurations
- Simplified key management with automatic namespacing
- Improved type safety with store-specific interfaces

## [1.0.0] - 2025-02-11

### Added

- Initial release
- Redis cache implementation with TypeScript support
- Singleton pattern for cache instance management
- Support for custom logger injection
- Key features:
  - Get/Set operations with TTL support
  - Bulk operations
  - Pipeline execution
  - Pattern-based key search
  - Automatic JSON serialization/deserialization
  - Connection management with retry strategy
  - Test environment support with key prefixing
