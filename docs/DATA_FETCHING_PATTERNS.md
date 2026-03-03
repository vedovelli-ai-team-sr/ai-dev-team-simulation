# Advanced Data Fetching Patterns

This document outlines the data fetching patterns and utilities established in FAB-11 that should be reused throughout the application.

## Overview

We've implemented a robust data layer using TanStack Query with three core patterns:

1. **Optimistic Updates** - User sees changes immediately with automatic rollback on error
2. **Pagination** - Efficient data fetching with typed navigation helpers
3. **Cache Invalidation** - Centralized strategies for managing cache consistency

## Quick Start

### Optimistic Updates

Use `useOptimisticUpdate` for mutations where users expect immediate feedback:

```tsx
const mutation = useOptimisticUpdate({
  mutationFn: (data) => updateTask(data),
  queryKey: ['tasks', taskId],
  optimisticData: (variables, previous) => ({
    ...previous,
    ...variables,
  }),
})

mutation.mutate({ status: 'done' })
```

**When to use:**
- Task status changes
- Form submissions
- Quick inline edits
- Any mutation with expected fast server response

### Paginated Queries

Use `usePaginatedQuery` for large lists:

```tsx
const { data, pageIndex, nextPage, previousPage, pageCount } = usePaginatedQuery({
  queryKey: ['tasks'],
  queryFn: ({ pageIndex, pageSize }) =>
    fetch(`/api/tasks?page=${pageIndex}&size=${pageSize}`).then(r => r.json()),
  initialPageSize: 20,
})
```

**Features:**
- Automatic pagination state management
- Page navigation helpers
- Type-safe responses
- Built-in bounds checking

### Cache Invalidation

Use centralized strategies for consistency:

```tsx
const mutation = useOptimisticUpdate({
  mutationFn: updateTask,
  queryKey: ['tasks'],
  optimisticData: (v) => v,
  onSuccess: async () => {
    // Handles cascading invalidations
    await invalidationStrategies.taskModified(queryClient)
  },
})
```

## Detailed Patterns

### Pattern 1: Simple Optimistic Update

**Use case:** Toggle a boolean field

```tsx
function TaskStatusToggle({ task }: { task: Task }) {
  const mutation = useOptimisticUpdate({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Update failed')
      return res.json()
    },
    queryKey: ['tasks', task.id],
    optimisticData: (status) => ({ ...task, status }),
  })

  return (
    <select
      value={task.status}
      onChange={(e) => mutation.mutate(e.target.value)}
      disabled={mutation.isPending}
    >
      {/* options */}
    </select>
  )
}
```

### Pattern 2: Paginated List with Filters

**Use case:** Task list with pagination and filtering

```tsx
function TaskList({ sprint }: { sprint: string }) {
  const { data, isLoading, nextPage, pageCount } = usePaginatedQuery({
    queryKey: queryKeys.tasks.list({ sprint }),
    queryFn: ({ pageIndex, pageSize }) =>
      fetch(`/api/tasks?sprint=${sprint}&page=${pageIndex}&size=${pageSize}`)
        .then(r => r.json()),
    initialPageSize: 20,
  })

  if (isLoading) return <Loading />

  return (
    <>
      <ul>
        {data.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ul>
      <button onClick={nextPage}>Next Page</button>
    </>
  )
}
```

### Pattern 3: Error Handling with Retry

**Use case:** Mutation with explicit error handling

```tsx
function CreateTaskForm() {
  const mutation = useOptimisticUpdate({
    mutationFn: async (data: CreateTaskInput) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message)
      }
      return res.json()
    },
    queryKey: ['tasks'],
    optimisticData: (input) => ({
      id: `temp-${Date.now()}`,
      ...input,
      createdAt: new Date().toISOString(),
    }),
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      mutation.mutate(formData)
    }}>
      {mutation.error && (
        <div className="alert">
          <p>{mutation.error.message}</p>
          <button type="button" onClick={() => mutation.mutate(formData)}>
            Retry
          </button>
        </div>
      )}
      {/* form fields */}
    </form>
  )
}
```

### Pattern 4: Related Data Invalidation

**Use case:** Update affects multiple queries

```tsx
function CompleteTask({ taskId, sprintId }: Props) {
  const mutation = useOptimisticUpdate({
    mutationFn: (data) => updateTask(taskId, data),
    queryKey: ['tasks', taskId],
    optimisticData: (v) => v,
    onSuccess: async () => {
      // Task completion affects sprint metrics
      await invalidationStrategies.sprintModified(queryClient, sprintId)
    },
  })

  return (
    <button onClick={() => mutation.mutate({ status: 'done' })}>
      Complete Task
    </button>
  )
}
```

## Cache Invalidation Strategies

The `invalidationStrategies` object provides centralized cache management:

### taskModified
Invalidates:
- All task lists and filters
- Sprint metrics (affected by task changes)
- Agent analytics (if task affects workload)

```tsx
await invalidationStrategies.taskModified(queryClient)
```

### taskDependenciesChanged
Invalidates:
- The specific task
- All task lists (for ordering validation)

```tsx
await invalidationStrategies.taskDependenciesChanged(queryClient, taskId)
```

### projectModified
Invalidates:
- Project detail and lists

```tsx
await invalidationStrategies.projectModified(queryClient, projectId)
```

### sprintModified
Invalidates:
- Sprint details and metrics
- Task lists (for sprint filtering)

```tsx
await invalidationStrategies.sprintModified(queryClient, sprintId)
```

### agentModified
Invalidates:
- Agent details and lists

```tsx
await invalidationStrategies.agentModified(queryClient, agentId)
```

## Query Keys Structure

Use the `queryKeys` factory for consistency:

```typescript
// Tasks
queryKeys.tasks.all                    // ['tasks']
queryKeys.tasks.lists()                // ['tasks', 'list']
queryKeys.tasks.list({ sprint: 'S1' }) // ['tasks', 'list', { sprint: 'S1' }]
queryKeys.tasks.details()              // ['tasks', 'detail']
queryKeys.tasks.detail('task-1')       // ['tasks', 'detail', 'task-1']

// Sprints
queryKeys.sprints.all                     // ['sprints']
queryKeys.sprints.metrics('sprint-1')     // ['sprints', 'detail', 'sprint-1', 'metrics']

// Agents
queryKeys.agents.analytics('agent-1')     // ['agents', 'detail', 'agent-1', 'analytics']
queryKeys.agents.history('agent-1')       // ['agents', 'detail', 'agent-1', 'history']
```

## Error Handling

### MSW Error Scenarios

The `errorHandlers` object in `src/mocks/handlers-errors.ts` provides:

- **Validation errors (400, 422)** - Invalid input data
- **Not found (404)** - Resource doesn't exist
- **Server errors (500)** - Transient failures
- **Service unavailable (503)** - Temporary outages
- **Timeout (408)** - Slow network
- **Rate limiting (429)** - Too many requests
- **Authentication (401)** - Unauthorized
- **Authorization (403)** - Forbidden

### Handling Different Error Types

```tsx
const mutation = useOptimisticUpdate({
  mutationFn: updateTask,
  queryKey: ['tasks'],
  onError: (error) => {
    if (error.message.includes('duplicate')) {
      // Show validation-specific message
      showToast('Task name already exists')
    } else if (error.message.includes('timeout')) {
      // Offer retry for transient errors
      showRetryButton()
    } else {
      // Generic error
      showToast(error.message)
    }
  },
})
```

## Performance Considerations

### Stale Time vs GC Time

```typescript
useQuery({
  queryKey: ['tasks'],
  queryFn: fetchTasks,
  staleTime: 1000 * 60 * 5,    // 5 minutes - data is fresh
  gcTime: 1000 * 60 * 10,      // 10 minutes - keep in cache
})
```

- **staleTime**: How long before data is considered stale
- **gcTime** (formerly `cacheTime`): How long to keep inactive queries

### Pagination Best Practices

1. **Use fixed page sizes** - Avoid dynamic pagination limits
2. **Normalize query keys** - Include filters in the key
3. **Reset on filter change** - Automatically handled by new query key
4. **Cache aggressively** - Stale time can be longer for stable data

```tsx
usePaginatedQuery({
  queryKey: ['tasks', { status: 'done', sprint }],
  queryFn: fetchTasks,
  // Page key is automatically appended:
  // ['tasks', { status: 'done', sprint }, { pageIndex: 0, pageSize: 20 }]
})
```

## Testing

### Testing Optimistic Updates

```tsx
test('rolls back on error', async () => {
  const { result } = renderHook(() => useOptimisticUpdate({...}))

  // Optimistic update
  act(() => result.current.mutate(data))
  expect(cache).toEqual(optimisticData)

  // Error occurs
  await waitFor(() => expect(result.current.isError).toBe(true))

  // Rolled back
  expect(cache).toEqual(previousData)
})
```

### Testing Pagination

```tsx
test('navigates pages', async () => {
  const { result } = renderHook(() => usePaginatedQuery({...}))

  act(() => result.current.nextPage())
  expect(result.current.pageIndex).toBe(1)

  act(() => result.current.setPageSize(50))
  expect(result.current.pageIndex).toBe(0) // Reset on size change
})
```

## Common Mistakes to Avoid

1. ❌ **Don't duplicate query keys** - Use the `queryKeys` factory
2. ❌ **Don't invalidate everything** - Use targeted strategies
3. ❌ **Don't skip error handling** - Always provide rollback
4. ❌ **Don't forget optimistic transforms** - Must handle both cases
5. ❌ **Don't use `any` types** - Leverage generics for type safety

## Migration Guide

When refactoring existing mutations to use these patterns:

### Before
```tsx
const [data, setData] = useState(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

const updateTask = async (id, updates) => {
  setLoading(true)
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    const result = await res.json()
    setData(result)
  } catch (e) {
    setError(e)
  } finally {
    setLoading(false)
  }
}
```

### After
```tsx
const mutation = useOptimisticUpdate({
  mutationFn: async ({ id, updates }) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  },
  queryKey: ['tasks', id],
  optimisticData: (v) => v,
})

// Use mutation.data, mutation.isPending, mutation.error
```

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Query Key Factory Pattern](https://tkdodo.eu/blog/effective-react-query-keys)
- [Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Pagination](https://tanstack.com/query/latest/docs/react/guides/paginated-queries)
