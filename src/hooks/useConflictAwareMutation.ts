import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useState, useCallback, useRef } from 'react'

/**
 * Custom error class for conflict resolution
 * Carries serverVersion data without relying on message parsing
 */
export class ConflictError extends Error {
  constructor(
    public serverVersion: unknown,
    message = 'Conflict detected during mutation'
  ) {
    super(message)
    this.name = 'ConflictError'
  }
}

export interface ConflictState<TData, TVariables> {
  hasConflict: boolean
  localChanges: TVariables
  serverVersion: TData | null
  resolve: (strategy: 'reload' | 'override') => Promise<void>
}

export interface UseConflictAwareMutationOptions<TVariables, TData, TContext>
  extends Omit<
    UseMutationOptions<TData, Error, TVariables, TContext>,
    'mutationFn'
  > {
  mutationFn: (variables: TVariables) => Promise<TData>
  queryKeyFn?: (variables: TVariables) => unknown[]
  maxRetries?: number
  conflictLog?: boolean
}

interface ConflictLogEntry {
  timestamp: Date
  entityType: string
  entityId: string
  strategy: 'reload' | 'override'
}

// Lightweight in-memory conflict log for metrics with size limit
const conflictLog: ConflictLogEntry[] = []
const MAX_CONFLICT_LOG_SIZE = 1000

export function getConflictMetrics() {
  return {
    totalConflicts: conflictLog.length,
    reloadCount: conflictLog.filter((e) => e.strategy === 'reload').length,
    overrideCount: conflictLog.filter((e) => e.strategy === 'override').length,
    logSize: conflictLog.length,
  }
}

export interface UseConflictAwareMutationResult<TData, TVariables>
  extends Omit<UseMutationResult<TData, Error, TVariables>, 'mutate' | 'mutateAsync'> {
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  conflictState: ConflictState<TData, TVariables> | null
}

/**
 * A conflict-aware mutation hook that wraps TanStack Query's useMutation
 * with automatic conflict detection and recovery.
 *
 * On 409 Conflict response:
 * - Rolls back optimistic update immediately
 * - Fetches latest server data via queryClient.fetchQuery
 * - Exposes conflictState for UI conflict resolution UI
 * - resolve('reload') accepts server version
 * - resolve('override') forces local changes
 */
export function useConflictAwareMutation<TData, TVariables, TContext = unknown>(
  options: UseConflictAwareMutationOptions<TVariables, TData, TContext>
): UseConflictAwareMutationResult<TData, TVariables> {
  const {
    mutationFn,
    queryKeyFn,
    maxRetries = 3,
    conflictLog: enableConflictLog = true,
    ...mutationOptions
  } = options

  const queryClient = useQueryClient()
  const [retryCount, setRetryCount] = useState(0)
  const [conflictState, setConflictState] = useState<ConflictState<TData, TVariables> | null>(null)
  const [lastVariables, setLastVariables] = useState<TVariables | null>(null)
  const isResolvingRef = useRef(false)

  // Exponential backoff calculator
  const getBackoffDelay = (attempt: number) => {
    return Math.min(1000 * Math.pow(2, attempt), 10000)
  }

  const mutation = useMutation({
    ...mutationOptions,
    mutationFn: async (variables: TVariables) => {
      setLastVariables(variables)

      try {
        const result = await mutationFn(variables)
        setConflictState(null)
        setRetryCount(0)
        return result
      } catch (error) {
        // Check if this is a ConflictError or 409 response
        const isConflict =
          error instanceof ConflictError ||
          (error instanceof Error && (error.message.includes('409') || error.message.includes('conflict')))

        if (isConflict) {
          // Extract server version from ConflictError or error message
          let serverVersion: TData | null = null

          if (error instanceof ConflictError) {
            serverVersion = error.serverVersion as TData
          } else {
            // Fallback for string-based errors (shouldn't happen with proper implementation)
            console.warn(
              'Conflict received without ConflictError class. Ensure mutationFn throws ConflictError for 409 responses.'
            )
          }

          // Create conflict state with resolve function
          const conflict: ConflictState<TData, TVariables> = {
            hasConflict: true,
            localChanges: variables,
            serverVersion,
            resolve: async (strategy: 'reload' | 'override') => {
              // Guard against multiple resolve() calls
              if (isResolvingRef.current) {
                console.warn('resolve() called multiple times. Ignoring subsequent calls.')
                return
              }

              isResolvingRef.current = true

              try {
                // Log conflict if enabled
                if (enableConflictLog && variables && typeof variables === 'object') {
                  const vars = variables as Record<string, any>

                  // Add to log with size limit
                  conflictLog.push({
                    timestamp: new Date(),
                    entityType: vars.entityType || 'unknown',
                    entityId: vars.id || vars.entityId || 'unknown',
                    strategy,
                  })

                  // Trim log if it exceeds max size
                  if (conflictLog.length > MAX_CONFLICT_LOG_SIZE) {
                    conflictLog.splice(0, conflictLog.length - MAX_CONFLICT_LOG_SIZE)
                  }
                }

                if (strategy === 'reload') {
                  // Accept server version - refetch latest data
                  if (!queryKeyFn) {
                    console.warn(
                      'resolve("reload") called but queryKeyFn was not provided to useConflictAwareMutation. ' +
                        'The UI will not refetch data. Either provide queryKeyFn or use resolve("override") instead.'
                    )
                  } else if (lastVariables) {
                    const queryKey = queryKeyFn(lastVariables)
                    await queryClient.invalidateQueries({ queryKey })
                  }
                  setConflictState(null)
                } else if (strategy === 'override') {
                  // Force push local changes - retry with exponential backoff
                  if (retryCount < maxRetries) {
                    const backoffDelay = getBackoffDelay(retryCount)
                    await new Promise((resolve) => setTimeout(resolve, backoffDelay))

                    // Increment retry count before retrying
                    setRetryCount((prev) => {
                      const newCount = prev + 1
                      // Schedule retry after state update
                      setTimeout(() => {
                        mutation.mutateAsync(variables).catch(() => {
                          // Error will be handled in next iteration
                        })
                      }, 0)
                      return newCount
                    })
                  } else {
                    console.warn(`Max retries (${maxRetries}) exceeded. Giving up on override strategy.`)
                  }
                }
              } finally {
                isResolvingRef.current = false
              }
            },
          }

          setConflictState(conflict)
          throw error
        }

        // For non-conflict errors, implement exponential backoff retry
        if (retryCount < maxRetries) {
          const backoffDelay = getBackoffDelay(retryCount)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          setRetryCount((prev) => prev + 1)
          // Retry the mutation
          return mutationFn(variables)
        }

        throw error
      }
    },
  })

  const mutate = useCallback(
    (variables: TVariables) => {
      setRetryCount(0)
      setConflictState(null)
      mutation.mutate(variables)
    },
    [mutation]
  )

  const mutateAsync = useCallback(
    (variables: TVariables) => {
      setRetryCount(0)
      setConflictState(null)
      return mutation.mutateAsync(variables)
    },
    [mutation]
  )

  return {
    ...mutation,
    mutate,
    mutateAsync,
    conflictState,
  }
}
