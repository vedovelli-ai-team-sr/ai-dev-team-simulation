import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'

/**
 * Generic context for optimistic update rollback
 */
export interface OptimisticUpdateContext<TData> {
  previousData: TData | undefined
  optimisticData?: TData
}

/**
 * Options for useOptimisticUpdate hook
 */
export interface UseOptimisticUpdateOptions<
  TData,
  TVariables,
  TContext = OptimisticUpdateContext<TData>,
> extends Omit<
    UseMutationOptions<TData, Error, TVariables, TContext>,
    'mutationFn' | 'onMutate' | 'onError'
  > {
  mutationFn: (variables: TVariables) => Promise<TData>
  queryKey: unknown[]
  /**
   * Transform variables into optimistic data.
   * If not provided, optimistic update is skipped.
   */
  optimisticData?: (variables: TVariables, previousData?: TData) => TData
}

/**
 * A type-safe hook for mutations with optimistic updates and automatic rollback on error.
 *
 * Usage:
 * ```tsx
 * const { mutate, isPending, error } = useOptimisticUpdate({
 *   mutationFn: (data) => updateTask(data),
 *   queryKey: ['tasks', taskId],
 *   optimisticData: (variables, previous) => ({
 *     ...previous,
 *     ...variables,
 *   }),
 * })
 * ```
 */
export function useOptimisticUpdate<
  TData,
  TVariables,
  TContext = OptimisticUpdateContext<TData>,
>(
  options: UseOptimisticUpdateOptions<TData, TVariables, TContext>
): UseMutationResult<TData, Error, TVariables, TContext> {
  const queryClient = useQueryClient()
  const { mutationFn, queryKey, optimisticData, ...mutationOptions } = options

  return useMutation<TData, Error, TVariables, TContext>({
    ...mutationOptions,
    mutationFn,
    onMutate: async (variables) => {
      // Cancel any outgoing queries for this key
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous data
      const previousData = queryClient.getQueryData<TData>(queryKey)

      // Optimistically update the cache if transform function is provided
      if (optimisticData) {
        const optimistic = optimisticData(variables, previousData)
        queryClient.setQueryData(queryKey, optimistic)

        return {
          previousData,
          optimisticData: optimistic,
        } as TContext
      }

      return { previousData } as TContext
    },
    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }

      // Call user's onError if provided
      options.onError?.(error, variables, context)
    },
  })
}
