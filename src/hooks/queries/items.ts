import { useQuery } from '@tanstack/react-query'
import type { Item, ItemsFilterParams } from '../../types/item'
import { ItemError } from '../../types/item'

/**
 * Query keys factory for item queries.
 * Follows TanStack Query best practices for organizing cache keys.
 * @see https://tanstack.com/query/latest/docs/react/important-defaults
 */
export const itemKeys = {
  all: ['items'] as const,
  lists: () => [...itemKeys.all, 'list'] as const,
  list: (filters?: ItemsFilterParams) => [...itemKeys.lists(), ...(filters ? [filters] : [])] as const,
  details: () => [...itemKeys.all, 'detail'] as const,
  detail: (id: string) => [...itemKeys.details(), id] as const,
}

interface ItemsListResponse {
  data: Item[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Fetch all items with pagination support.
 * Implements stale-while-revalidate pattern with 5-minute stale time.
 * Automatically refetches on window focus.
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of items per page
 * @param sortBy - Optional sort field
 * @returns Items array with loading and error states
 */
export function useItems(page: number = 1, pageSize: number = 10, sortBy?: string) {
  return useQuery<ItemsListResponse, ItemError>({
    queryKey: itemKeys.list({ page, pageSize, sortBy }),
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
        if (sortBy) {
          params.append('sortBy', sortBy)
        }
        const response = await fetch(`/api/items?${params}`)
        if (!response.ok) {
          throw ItemError.fromResponse(response.status, `Failed to fetch items: ${response.statusText}`)
        }
        return response.json()
      } catch (error) {
        if (error instanceof ItemError) {
          throw error
        }
        throw ItemError.fromNetworkError(error)
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes (stale-while-revalidate)
    gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: true, // Automatic refetch on window focus
    retry: (failureCount, error) => {
      // Don't retry NotFound errors
      if (error instanceof ItemError && error.type === 'NotFound') {
        return false
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },
  })
}

/**
 * Fetch a single item by ID.
 * @param id - The item ID to fetch
 * @returns Single Item object with loading and error states
 */
export function useItem(id: string) {
  return useQuery<Item, ItemError>({
    queryKey: itemKeys.detail(id),
    queryFn: async () => {
      try {
        const response = await fetch(`/api/items/${id}`)
        if (!response.ok) {
          throw ItemError.fromResponse(response.status, `Failed to fetch item ${id}: ${response.statusText}`)
        }
        return response.json()
      } catch (error) {
        if (error instanceof ItemError) {
          throw error
        }
        throw ItemError.fromNetworkError(error)
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: true,
    // Only run query if id is provided and is not empty
    enabled: id.length > 0,
    retry: (failureCount, error) => {
      // Don't retry NotFound errors
      if (error instanceof ItemError && error.type === 'NotFound') {
        return false
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },
  })
}
