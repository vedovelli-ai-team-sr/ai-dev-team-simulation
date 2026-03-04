/**
 * Custom hooks for data fetching and query management
 * 
 * Exports:
 * - useOptimisticUpdate: Hook for mutations with optimistic updates and rollback
 * - usePaginatedQuery: Hook for paginated queries with navigation helpers
 */

export { useOptimisticUpdate } from './useOptimisticUpdate'
export type { UseOptimisticUpdateOptions, OptimisticUpdateContext } from './useOptimisticUpdate'

export { usePaginatedQuery } from './usePaginatedQuery'
export type {
  UsePaginatedQueryOptions,
  UsePaginatedQueryResult,
  PaginatedResponse,
  PaginationState,
} from './usePaginatedQuery'
