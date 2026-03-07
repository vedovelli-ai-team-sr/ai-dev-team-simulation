/**
 * Resilient Query Hook with Exponential Backoff and Circuit Breaker
 *
 * This hook wraps TanStack Query with production-ready resilience patterns:
 * - Exponential backoff for retries
 * - Circuit breaker pattern to fail fast after repeated failures
 * - Configurable retry policies per query
 * - Full TypeScript type safety
 *
 * @example
 * const { data, isLoading, error, isCircuitBreakerOpen } = useResilientQuery({
 *   queryKey: ['user', userId],
 *   queryFn: () => fetchUser(userId),
 *   retryConfig: {
 *     maxAttempts: 3,
 *     baseDelay: 1000,
 *     maxDelay: 10000,
 *     circuitBreakerThreshold: 5,
 *   },
 *   onError: (error) => console.error('Query failed:', error),
 * })
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import type {
  ResilientQueryOptions,
  ResilientQueryResult,
  RetryConfig,
  CircuitBreakerState,
} from '@/types/resilience'
import { DEFAULT_RETRY_CONFIG } from '@/types/resilience'

/**
 * Global circuit breaker state storage
 * Maps query keys to their circuit breaker states
 *
 * Note: Uses WeakMap-like behavior by cleaning up on successful queries
 * and providing explicit cleanup for unmount scenarios
 */
const circuitBreakerStates = new Map<string, CircuitBreakerState>()

/**
 * Clear circuit breaker state for a query key
 * Called after successful query or on component unmount
 */
export function clearCircuitBreakerState(
  queryKey: readonly unknown[],
): void {
  const key = serializeQueryKey(queryKey)
  circuitBreakerStates.delete(key)
}

/**
 * Convert query key to string for circuit breaker tracking
 */
function serializeQueryKey(
  queryKey: readonly unknown[],
): string {
  return JSON.stringify(queryKey)
}

/**
 * Get or create circuit breaker state for a query key
 */
function getCircuitBreakerState(
  queryKey: readonly unknown[],
): CircuitBreakerState {
  const key = serializeQueryKey(queryKey)
  if (!circuitBreakerStates.has(key)) {
    circuitBreakerStates.set(key, {
      failureCount: 0,
      lastFailureTime: 0,
      isOpen: false,
    })
  }
  return circuitBreakerStates.get(key)!
}

/**
 * Update circuit breaker state after success
 */
function recordSuccess(queryKey: readonly unknown[]): void {
  const state = getCircuitBreakerState(queryKey)
  state.failureCount = 0
  state.isOpen = false
}

/**
 * Update circuit breaker state after failure
 */
function recordFailure(
  queryKey: readonly unknown[],
  config: RetryConfig,
): void {
  const state = getCircuitBreakerState(queryKey)
  state.failureCount += 1
  state.lastFailureTime = Date.now()

  if (state.failureCount >= config.circuitBreakerThreshold) {
    state.isOpen = true
  }
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  // Exponential: baseDelay * (2 ^ attempt)
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt - 1)
  // Cap at maxDelay
  return Math.min(exponentialDelay, config.maxDelay)
}

/**
 * Custom retry delay function for TanStack Query
 */
function createRetryDelayFn(config: RetryConfig) {
  return (attemptIndex: number): number => {
    return calculateBackoffDelay(attemptIndex + 1, config)
  }
}

/**
 * Custom retry function that respects circuit breaker
 */
function createRetryFn(
  config: RetryConfig,
  queryKey: readonly unknown[],
) {
  return (failureCount: number): boolean => {
    // Don't retry if we've exceeded max attempts
    if (failureCount > config.maxAttempts) {
      return false
    }

    // Don't retry if circuit breaker is open
    const cbState = getCircuitBreakerState(queryKey)
    if (cbState.isOpen) {
      return false
    }

    return true
  }
}

/**
 * Resilient query hook with exponential backoff and circuit breaker
 *
 * @param options - Query configuration with resilience settings
 * @returns Result object with data, loading state, and error information
 */
export function useResilientQuery<
  TData = unknown,
  TError = Error,
  TQueryKey extends readonly unknown[] = readonly unknown[]
>(
  options: ResilientQueryOptions<TData, TError, TQueryKey>,
): ResilientQueryResult<TData, TError> {
  const { queryKey, queryFn, retryConfig, onSuccess, onError } = options

  // Merge provided config with defaults
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryConfig,
  }

  // Track local retry state for UI
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [isCircuitBreakerOpen, setIsCircuitBreakerOpen] = useState(
    getCircuitBreakerState(queryKey).isOpen,
  )
  // Track the actual attempt number separately from failure count
  const [attemptCount, setAttemptCount] = useState(1)

  // Create wrapped query function that tracks circuit breaker state
  const wrappedQueryFn = useCallback(async () => {
    const cbState = getCircuitBreakerState(queryKey)

    // Fail fast if circuit breaker is open
    if (cbState.isOpen) {
      throw new Error(
        `Circuit breaker is open for query ${serializeQueryKey(queryKey)}. Query execution skipped.`,
      )
    }

    try {
      const data = await queryFn()
      recordSuccess(queryKey)
      // Clean up the circuit breaker state after success to prevent memory growth
      clearCircuitBreakerState(queryKey)
      setRetryAttempt(0)
      setAttemptCount(1)
      setIsCircuitBreakerOpen(false)
      return data
    } catch (error) {
      recordFailure(queryKey, config)
      setIsCircuitBreakerOpen(getCircuitBreakerState(queryKey).isOpen)
      throw error
    }
  }, [queryKey, queryFn, config])

  // Use TanStack Query with retry configuration
  const query = useQuery<TData, TError>({
    queryKey: queryKey as TQueryKey,
    queryFn: wrappedQueryFn,
    retry: createRetryFn(config, queryKey),
    retryDelay: createRetryDelayFn(config),
  })

  // Track retry attempts from the query state
  useEffect(() => {
    // Query tracks attempts internally, we extract from the query state
    // When the query is being retried, its status will be 'pending' with isFetching true
    if (query.status === 'pending' && query.isFetching) {
      // Use the actual attempt count, not failure count
      // Failure count only increments on failures, but attempt includes successful retries
      const cbState = getCircuitBreakerState(queryKey)
      setRetryAttempt(attemptCount + cbState.failureCount)
    }
  }, [query.status, query.isFetching, queryKey, attemptCount])

  // Call success callback
  useEffect(() => {
    if (query.isSuccess && onSuccess) {
      onSuccess(query.data)
    }
  }, [query.isSuccess, query.data, onSuccess])

  // Call error callback
  useEffect(() => {
    if (query.isError && onError) {
      onError(query.error)
    }
  }, [query.isError, query.error, onError])

  // Clean up circuit breaker state on unmount
  useEffect(() => {
    return () => {
      clearCircuitBreakerState(queryKey)
    }
  }, [queryKey])

  // Manual retry function
  // Atomically reset state and refetch to avoid race conditions
  const retry = useCallback(() => {
    const cbState = getCircuitBreakerState(queryKey)
    // Reset circuit breaker and failure count for manual retry
    cbState.failureCount = 0
    cbState.isOpen = false
    // Update all state synchronously before refetch to prevent stale reads
    setRetryAttempt(0)
    setAttemptCount(1)
    setIsCircuitBreakerOpen(false)
    // Refetch after all state updates are batched
    query.refetch()
  }, [queryKey, query])

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isCircuitBreakerOpen,
    retryAttempt,
    retry,
  }
}
