/**
 * Utility functions and constants for data management
 * 
 * Exports:
 * - queryKeys: Query key factory for consistent cache management
 * - invalidationStrategies: Cache invalidation strategies for mutations
 * - invalidateAllCaches: Utility to clear entire cache (use sparingly)
 */

export {
  queryKeys,
  invalidationStrategies,
  invalidateAllCaches,
} from './cacheInvalidation'
