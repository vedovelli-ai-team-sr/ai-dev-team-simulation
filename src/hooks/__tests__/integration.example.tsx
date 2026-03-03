/**
 * Integration example: Complete data fetching pattern with optimistic updates and pagination
 *
 * This example shows how to combine useOptimisticUpdate and usePaginatedQuery
 * in a real component with error boundaries and loading states.
 */

import { FC } from 'react'
import type { Task } from '../../types/task'
import type { UpdateTaskInput } from '../../types/task'
import { useOptimisticUpdate } from '../useOptimisticUpdate'
import { usePaginatedQuery } from '../usePaginatedQuery'
import { invalidationStrategies, queryKeys } from '../../lib/cacheInvalidation'

/**
 * Example: Task list with pagination and inline editing
 *
 * Features:
 * - Paginated task list
 * - Optimistic updates on task changes
 * - Rollback on error with retry option
 * - Error boundary handling
 * - Proper cache invalidation
 */
export const TaskListExample: FC = () => {
  // Fetch paginated tasks
  const {
    data: tasks,
    pageIndex,
    pageSize,
    pageCount,
    isLoading,
    isError,
    error,
    nextPage,
    previousPage,
    setPageSize,
  } = usePaginatedQuery<Task>({
    queryKey: queryKeys.tasks.lists(),
    queryFn: async ({ pageIndex, pageSize }) => {
      const response = await fetch(
        `/api/tasks?pageIndex=${pageIndex}&pageSize=${pageSize}`
      )
      if (!response.ok) throw new Error('Failed to fetch tasks')
      return response.json()
    },
    initialPageSize: 20,
  })

  // Update task with optimistic updates
  const updateMutation = useOptimisticUpdate<Task, UpdateTaskInput>({
    mutationFn: async (data) => {
      const response = await fetch(`/api/tasks/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to update task')
      return response.json()
    },
    queryKey: queryKeys.tasks.lists(),
    optimisticData: (variables, previous) => {
      if (!previous) return variables
      // For paginated lists, we need to find and update the specific task
      return {
        ...previous,
        // Update logic here
      }
    },
    onSuccess: async () => {
      // Invalidate sprint metrics since task changed
      // This is handled by cache invalidation strategies
      await invalidationStrategies.taskModified(/* queryClient */)
    },
  })

  if (isLoading) {
    return <div>Loading tasks...</div>
  }

  if (isError) {
    return (
      <div>
        <p>Error: {error?.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div>
      <div className="controls">
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>

        <div className="pagination">
          <button onClick={previousPage} disabled={pageIndex === 0}>
            Previous
          </button>
          <span>
            Page {pageIndex + 1} of {pageCount}
          </span>
          <button onClick={nextPage} disabled={pageIndex >= pageCount - 1}>
            Next
          </button>
        </div>
      </div>

      <ul>
        {tasks.map((task) => (
          <li key={task.id} className={updateMutation.isPending ? 'updating' : ''}>
            <span>{task.title}</span>
            <select
              value={task.status}
              onChange={(e) =>
                updateMutation.mutate({
                  ...task,
                  status: e.target.value as any,
                })
              }
              disabled={updateMutation.isPending}
            >
              <option value="backlog">Backlog</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>

            {updateMutation.isError && <span className="error">Failed to update</span>}
          </li>
        ))}
      </ul>

      {updateMutation.isError && (
        <div className="error-banner">
          <p>{updateMutation.error?.message}</p>
          <button onClick={() => updateMutation.mutate(/* lastVariables */)}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Example: Using optimistic updates with error handling pattern
 *
 * Shows how to structure error handling with a mutation error alert component
 */
export const TaskUpdateWithErrorHandling: FC<{ taskId: string }> = ({
  taskId,
}) => {
  const mutation = useOptimisticUpdate<Task, Partial<Task>>({
    mutationFn: async (data) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update task')
      }

      return response.json()
    },
    queryKey: queryKeys.tasks.detail(taskId),
    optimisticData: (variables, previous) => ({
      ...previous,
      ...variables,
    }),
  })

  return (
    <div>
      {mutation.isError && (
        <div className="alert alert-error">
          <p>{mutation.error?.message}</p>
          <button
            onClick={() => {
              // Implement retry logic here
            }}
          >
            Retry
          </button>
        </div>
      )}

      <button
        onClick={() =>
          mutation.mutate({
            status: 'in-progress',
          })
        }
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Updating...' : 'Start Task'}
      </button>
    </div>
  )
}

/**
 * Pattern: Cache invalidation after mutations
 *
 * Shows the recommended pattern for invalidating related queries
 * after a mutation succeeds
 */
export const CacheInvalidationPattern = () => {
  const updateTaskMutation = useOptimisticUpdate<Task, UpdateTaskInput>({
    mutationFn: async (data) => {
      // ... fetch logic
      return {} as Task
    },
    queryKey: queryKeys.tasks.lists(),
    optimisticData: (v) => v as Task,
    onSuccess: async (data, variables, context) => {
      // Use invalidation strategies to handle cascading invalidations
      // This pattern prevents over-fetching while keeping data consistent

      // Option 1: Simple task list invalidation
      // await invalidationStrategies.taskModified(queryClient)

      // Option 2: Task-specific invalidation if you track individual tasks
      // queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(data.id) })

      // Option 3: Sprint-specific if task is in a sprint
      // await invalidationStrategies.sprintModified(queryClient, data.sprint)
    },
  })

  return null
}

/**
 * Best practices demonstrated:
 *
 * 1. **Optimistic Updates**: User sees changes immediately
 * 2. **Rollback on Error**: Automatic recovery from failed mutations
 * 3. **Type Safety**: Generic types ensure data consistency
 * 4. **Cache Invalidation**: Related queries update automatically
 * 5. **Error Handling**: Clear error states and retry options
 * 6. **Pagination**: Efficient data fetching with navigation
 * 7. **Loading States**: Disable UI appropriately during mutations
 *
 * Common patterns:
 *
 * - Use `queryKeys` factory for consistent cache management
 * - Use `invalidationStrategies` to handle cascading invalidations
 * - Provide optimistic transforms that merge variables with previous data
 * - Handle both immediate errors and retry scenarios
 * - Show loading states during mutations
 */
