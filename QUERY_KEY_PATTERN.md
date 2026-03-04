# TanStack Query Key Pattern Guide

This document describes the query key factory pattern used throughout the project for predictable cache invalidation and query organization.

## Overview

The query key factory pattern provides a centralized, type-safe way to manage cache keys across your application. This prevents typos, ensures consistency, and makes cache invalidation straightforward.

## Pattern Structure

Each query module exports a `Keys` object (e.g., `itemKeys`, `userKeys`) with the following structure:

```typescript
export const itemKeys = {
  all: ['items'] as const,           // Base key for all item queries
  lists: () => [...itemKeys.all, 'list'] as const,  // Namespace for list queries
  list: (filters?: ItemsFilterParams) =>      // Specific list query with type-safe filters
    [...itemKeys.lists(), ...(filters ? [filters] : [])] as const,
  details: () => [...itemKeys.all, 'detail'] as const,  // Namespace for detail queries
  detail: (id: string) => [...itemKeys.details(), id] as const,  // Specific detail query
}
```

### Filter Parameters

Filters are type-safe via the `ItemsFilterParams` interface:

```typescript
export interface ItemsFilterParams {
  page?: number
  pageSize?: number
  sortBy?: string
}
```

This ensures TypeScript catches invalid filter keys at compile time.

## Usage Examples

### Basic Query

```typescript
import { useItems, itemKeys } from '@/hooks/queries/items'

export function ItemsList() {
  const { data, isLoading, error } = useItems(1, 10)

  // Query automatically uses itemKeys.list({ page: 1, pageSize: 10 }) as cache key
  return <div>{/* render items */}</div>
}
```

### Error Handling

The hooks return typed `ItemError` objects that distinguish error types:

```typescript
import { useItems } from '@/hooks/queries/items'
import type { ItemError } from '@/types/item'

export function ItemsList() {
  const { data, error } = useItems(1, 10)
  const itemError = error as ItemError | null

  if (itemError?.type === 'NotFound') {
    return <div>Page not found</div>
  }
  if (itemError?.type === 'ServerError') {
    return <div>Server error - try again later</div>
  }
  if (itemError?.type === 'NetworkError') {
    return <div>Network connection issue</div>
  }

  return <div>{/* render items */}</div>
}
```

### Mutations with Cache Invalidation

Create, update, and delete operations automatically invalidate related queries:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCreateItem, useUpdateItem, useDeleteItem } from '@/hooks/queries/itemMutations'
import { itemKeys } from '@/hooks/queries/items'

export function ItemForm() {
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()

  const handleCreate = async (newItem) => {
    // On success, automatically invalidates itemKeys.lists()
    await createItem.mutateAsync({ title: 'New Item', description: '...' })
  }

  const handleUpdate = async (id, updates) => {
    // On success, invalidates itemKeys.detail(id) and itemKeys.lists()
    await updateItem.mutateAsync({ id, ...updates })
  }

  const handleDelete = async (id) => {
    // On success, removes itemKeys.detail(id) and invalidates itemKeys.lists()
    await deleteItem.mutateAsync(id)
  }

  return <div>{/* form code */}</div>
}
```

### Invalidating Cache

You can also manually invalidate queries when needed:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { itemKeys } from '@/hooks/queries/items'

export function MyComponent() {
  const queryClient = useQueryClient()

  // Invalidate only a specific page
  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: itemKeys.list({ page: 1, pageSize: 10 }),
    })
  }

  // Invalidate all item lists
  const handleRefreshAll = () => {
    queryClient.invalidateQueries({
      queryKey: itemKeys.lists(),
    })
  }

  return <div>{/* component */}</div>
}
```

### Partial Invalidation

The hierarchical key structure supports partial invalidation:

```typescript
// Invalidate only items on page 1
queryClient.invalidateQueries({
  queryKey: itemKeys.list({ page: 1, pageSize: 10 }),
})

// Invalidate all lists (all pages)
queryClient.invalidateQueries({
  queryKey: itemKeys.lists(),
})

// Invalidate only a specific item detail
queryClient.invalidateQueries({
  queryKey: itemKeys.detail('item-123'),
})

// Invalidate all item queries (lists and details)
queryClient.invalidateQueries({
  queryKey: itemKeys.all,
})
```

## Key Hierarchy

Keys are organized hierarchically to support partial invalidation:

```
['items']                                          // all items
├── ['items', 'list']                              // all list queries
│   └── ['items', 'list', {page:1, pageSize:10}] // specific page
└── ['items', 'detail']                            // all detail queries
    └── ['items', 'detail', 'id-1']               // specific item detail
```

## Deduplication

TanStack Query automatically deduplicates requests when the same query key is used across multiple components:

```typescript
export function App() {
  return (
    <>
      <ItemsList page={1} />  {/* Makes request for itemKeys.list({ page: 1 }) */}
      <ItemsList page={1} />  {/* Reuses same cache, no duplicate request */}
    </>
  )
}
```

## Stale-While-Revalidate Pattern

Our hooks implement the stale-while-revalidate pattern:

```typescript
staleTime: 1000 * 60 * 5,     // 5 minutes - data is considered fresh
gcTime: 1000 * 60 * 10,       // 10 minutes - data is garbage collected
refetchOnWindowFocus: true,   // Refetch when user returns to window
```

- **Fresh**: Data is immediately used without making a request
- **Stale but usable**: Data is shown while a background refetch happens
- **Garbage collection**: After 10 minutes of inactivity, cached data is removed

## Error Types

The library provides typed error handling via `ItemError`:

```typescript
export type ItemErrorType = 'NotFound' | 'ServerError' | 'NetworkError' | 'Unknown'

// Usage:
const { error } = useItems()
if (error instanceof ItemError && error.type === 'NotFound') {
  // Handle 404 specifically
}
```

## Benefits

1. **Type Safety**: Keys are strongly typed and autocompleted by TypeScript
2. **Type-Safe Filters**: Filter parameters are validated at compile time
3. **Error Type Discrimination**: Distinguish between 404, 500, and network errors
4. **Consistency**: All queries use the same key structure
5. **Easy Invalidation**: Query invalidation is clear and predictable
6. **Automatic Deduplication**: Multiple components requesting the same data reuse cache
7. **Mutation Integration**: Create/update/delete operations with automatic cache invalidation
8. **Maintainability**: Centralizing keys and types makes refactoring easier

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Query Key Best Practices](https://tanstack.com/query/latest/docs/react/important-defaults)
