import { useMutation, useQueryClient } from '@tanstack/react-query'
import { itemKeys } from './items'
import type { Item } from '../../types/item'
import { ItemError } from '../../types/item'

interface CreateItemInput {
  title: string
  description: string
}

interface UpdateItemInput {
  id: string
  title?: string
  description?: string
}

/**
 * Create a new item and invalidate all item list queries.
 * The mutation automatically handles cache invalidation for consistency.
 */
export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation<Item, ItemError, CreateItemInput>({
    mutationFn: async (newItem) => {
      try {
        const response = await fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        })
        if (!response.ok) {
          throw ItemError.fromResponse(response.status, `Failed to create item: ${response.statusText}`)
        }
        return response.json()
      } catch (error) {
        if (error instanceof ItemError) {
          throw error
        }
        throw ItemError.fromNetworkError(error)
      }
    },
    onSuccess: () => {
      // Invalidate all item list queries to refetch with new item
      queryClient.invalidateQueries({ queryKey: itemKeys.lists() })
    },
  })
}

/**
 * Update an existing item and invalidate related queries.
 * Invalidates the specific item detail and all lists to ensure consistency.
 */
export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation<Item, ItemError, UpdateItemInput>({
    mutationFn: async (updateData) => {
      const { id, ...updates } = updateData
      try {
        const response = await fetch(`/api/items/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (!response.ok) {
          throw ItemError.fromResponse(response.status, `Failed to update item: ${response.statusText}`)
        }
        return response.json()
      } catch (error) {
        if (error instanceof ItemError) {
          throw error
        }
        throw ItemError.fromNetworkError(error)
      }
    },
    onSuccess: (data) => {
      // Invalidate the specific item detail
      queryClient.invalidateQueries({ queryKey: itemKeys.detail(data.id) })
      // Invalidate all lists to reflect the change
      queryClient.invalidateQueries({ queryKey: itemKeys.lists() })
    },
  })
}

/**
 * Delete an item and invalidate related queries.
 * Removes the item from all caches after successful deletion.
 */
export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation<void, ItemError, string>({
    mutationFn: async (id) => {
      try {
        const response = await fetch(`/api/items/${id}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          throw ItemError.fromResponse(response.status, `Failed to delete item: ${response.statusText}`)
        }
      } catch (error) {
        if (error instanceof ItemError) {
          throw error
        }
        throw ItemError.fromNetworkError(error)
      }
    },
    onSuccess: (_data, id) => {
      // Remove the specific item detail from cache
      queryClient.removeQueries({ queryKey: itemKeys.detail(id) })
      // Invalidate all lists to reflect the deletion
      queryClient.invalidateQueries({ queryKey: itemKeys.lists() })
    },
  })
}
