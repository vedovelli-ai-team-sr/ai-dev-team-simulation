/**
 * Advanced Query Hook with Proper Typing
 *
 * This hook demonstrates best practices for TanStack Query usage:
 * - Full TypeScript support with generics
 * - Consistent error handling
 * - Query key factory integration
 * - Optimized caching strategy
 *
 * @example
 * const { data, isLoading, error } = useAdvancedQuery({
 *   queryKey: queryKeys.tasks.list(),
 *   queryFn: fetchTasks,
 * })
 */

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryKey,
} from '@tanstack/react-query'
import { useEffect } from 'react'

interface AdvancedQueryOptions<TData, TError = Error>
  extends Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  onSuccess?: (data: TData) => void
  onError?: (error: TError) => void
}

interface AdvancedQueryResult<TData, TError = Error>
  extends UseQueryResult<TData, TError> {
  isIdle: boolean
}

/**
 * Advanced query hook with enhanced error handling and callbacks
 *
 * @param options - Query options with queryKey and queryFn
 * @returns Query result with loading, error, and data states
 */
export function useAdvancedQuery<TData, TError = Error>(
  options: AdvancedQueryOptions<TData, TError>,
): AdvancedQueryResult<TData, TError> {
  const { onSuccess, onError, ...queryOptions } = options

  const result = useQuery<TData, TError>({
    ...queryOptions,
    queryKey: options.queryKey,
    queryFn: options.queryFn,
  })

  // Call success callback when data is available
  useEffect(() => {
    if (result.isSuccess && onSuccess && result.data) {
      onSuccess(result.data)
    }
  }, [result.isSuccess, result.data, onSuccess])

  // Call error callback when error occurs
  useEffect(() => {
    if (result.isError && onError && result.error) {
      onError(result.error)
    }
  }, [result.isError, result.error, onError])

  return {
    ...result,
    isIdle: result.status === 'pending' && !result.isFetching,
  } as AdvancedQueryResult<TData, TError>
}

/**
 * Specialized hook for fetching a list of items with pagination/filtering support
 *
 * @example
 * const { data: tasks, isLoading } = useListQuery({
 *   queryKey: queryKeys.tasks.list({ status: 'in-progress' }),
 *   queryFn: () => fetchTasks({ status: 'in-progress' }),
 * })
 */
export function useListQuery<TItem, TError = Error>(
  options: AdvancedQueryOptions<TItem[], TError>,
): AdvancedQueryResult<TItem[], TError> {
  return useAdvancedQuery(options)
}

/**
 * Specialized hook for fetching a single item by ID
 *
 * @example
 * const { data: task } = useDetailQuery({
 *   queryKey: queryKeys.tasks.detail('task-123'),
 *   queryFn: () => fetchTask('task-123'),
 *   enabled: !!taskId, // Conditional query
 * })
 */
export function useDetailQuery<TItem, TError = Error>(
  options: AdvancedQueryOptions<TItem, TError>,
): AdvancedQueryResult<TItem, TError> {
  return useAdvancedQuery(options)
}
