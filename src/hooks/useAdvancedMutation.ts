/**
 * Advanced Mutation Hook with Proper Typing
 *
 * This hook demonstrates best practices for TanStack Query mutations:
 * - Full TypeScript support with generics
 * - Optimistic updates support
 * - Automatic cache invalidation
 * - Consistent error and success handling
 *
 * @example
 * const { mutate, isPending } = useAdvancedMutation({
 *   mutationFn: (data) => updateTask(taskId, data),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
 * })
 */

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { QueryKey } from '@tanstack/react-query'

interface AdvancedMutationOptions<
  TData,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'mutationFn'> {
  mutationFn: (variables: TVariables) => Promise<TData>
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: TError, variables: TVariables) => void
  invalidateQueries?: QueryKey
}

interface AdvancedMutationResult<TData, TError = Error, TVariables = void>
  extends UseMutationResult<TData, TError, TVariables> {
  isExecuting: boolean
}

/**
 * Advanced mutation hook with automatic cache invalidation and callbacks
 *
 * @param options - Mutation options with mutationFn and handlers
 * @returns Mutation result with mutate function and status states
 *
 * @example
 * const { mutate, isPending, error } = useAdvancedMutation({
 *   mutationFn: (data) => updateTaskAPI(taskId, data),
 *   onSuccess: (updatedTask) => {
 *     console.log('Updated:', updatedTask)
 *     // Component state updates can be done here
 *   },
 *   onError: (error) => {
 *     console.error('Update failed:', error.message)
 *   },
 *   invalidateQueries: queryKeys.tasks.all, // Auto-invalidate cache
 * })
 *
 * mutate({ title: 'New title' })
 */
export function useAdvancedMutation<
  TData,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: AdvancedMutationOptions<TData, TError, TVariables, TContext>,
): AdvancedMutationResult<TData, TError, TVariables> {
  const queryClient = useQueryClient()
  const {
    onSuccess,
    onError,
    invalidateQueries,
    ...mutationOptions
  } = options

  // Use refs to prevent infinite callback chains
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...mutationOptions,
    mutationFn: options.mutationFn,
    onSuccess: (data, variables, context) => {
      // Call user's onSuccess callback
      if (onSuccessRef.current) {
        onSuccessRef.current(data, variables)
      }

      // Invalidate queries if specified
      if (invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: invalidateQueries })
      }

      // Call original onSuccess if it exists
      if (mutationOptions.onSuccess) {
        mutationOptions.onSuccess(data, variables, context)
      }
    },
    onError: (error, variables, context) => {
      // Call user's onError callback
      if (onErrorRef.current) {
        onErrorRef.current(error, variables)
      }

      // Call original onError if it exists
      if (mutationOptions.onError) {
        mutationOptions.onError(error, variables, context)
      }
    },
  })

  return {
    ...mutation,
    isExecuting: mutation.isPending,
  } as AdvancedMutationResult<TData, TError, TVariables>
}

/**
 * Specialized hook for CREATE operations with automatic cache invalidation
 *
 * @param options - Mutation options with mutationFn and handlers
 * @returns Mutation result with mutate function and status states
 *
 * @example
 * const { mutate: createTask } = useCreateMutation({
 *   mutationFn: (data) => createNewTask(data),
 *   onSuccess: (newTask) => {
 *     console.log('Task created:', newTask)
 *     // Reset form or navigate
 *   },
 *   invalidateQueries: queryKeys.tasks.all,
 * })
 *
 * createTask({
 *   title: 'New Task',
 *   status: 'backlog',
 *   priority: 'medium',
 * })
 */
export function useCreateMutation<TData, TError = Error, TVariables = void>(
  options: AdvancedMutationOptions<TData, TError, TVariables>,
): AdvancedMutationResult<TData, TError, TVariables> {
  return useAdvancedMutation(options)
}

/**
 * Specialized hook for UPDATE operations with optimistic updates support
 *
 * @param options - Mutation options with mutationFn and handlers
 * @returns Mutation result with mutate function and status states
 *
 * @example
 * const { mutate: updateTask } = useUpdateMutation({
 *   mutationFn: (data) => updateTaskAPI(taskId, data),
 *   onMutate: async (variables) => {
 *     // Handle optimistic update here
 *     const previous = queryClient.getQueryData(queryKeys.tasks.detail(taskId))
 *     queryClient.setQueryData(queryKeys.tasks.detail(taskId), {
 *       ...previous,
 *       ...variables,
 *     })
 *     return { previous }
 *   },
 *   onError: (error, variables, context) => {
 *     // Rollback on error
 *     if (context?.previous) {
 *       queryClient.setQueryData(queryKeys.tasks.detail(taskId), context.previous)
 *     }
 *   },
 *   invalidateQueries: queryKeys.tasks.all,
 * })
 *
 * updateTask({ title: 'Updated Title', status: 'done' })
 */
export function useUpdateMutation<TData, TError = Error, TVariables = void>(
  options: AdvancedMutationOptions<TData, TError, TVariables>,
): AdvancedMutationResult<TData, TError, TVariables> {
  return useAdvancedMutation(options)
}

/**
 * Specialized hook for DELETE operations with cache cleanup
 *
 * @param options - Mutation options with mutationFn and handlers
 * @returns Mutation result with mutate function and status states
 *
 * @example
 * const { mutate: deleteTask } = useDeleteMutation({
 *   mutationFn: () => deleteTaskAPI(taskId),
 *   onSuccess: () => {
 *     console.log('Task deleted')
 *     // Navigate away or refresh list
 *   },
 *   invalidateQueries: queryKeys.tasks.all,
 * })
 *
 * // Call when user confirms delete
 * deleteTask()
 */
export function useDeleteMutation<TData, TError = Error, TVariables = void>(
  options: AdvancedMutationOptions<TData, TError, TVariables>,
): AdvancedMutationResult<TData, TError, TVariables> {
  return useAdvancedMutation(options)
}
