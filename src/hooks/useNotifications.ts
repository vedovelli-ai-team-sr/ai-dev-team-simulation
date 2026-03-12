import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Notification, NotificationCenter } from '../types/notification'
import { useMutationWithRetry } from './useMutationWithRetry'

/**
 * Configuration options for useNotifications hook
 */
export interface UseNotificationsOptions {
  /** Refetch interval in milliseconds (default: 30000 = 30s) */
  refetchInterval?: number
  /** Enable automatic refetch on window focus (default: true) */
  refetchOnWindowFocus?: boolean
  /** Filter to show only unread notifications (default: false) */
  unreadOnly?: boolean
}

/**
 * Mark notification as read request
 */
interface MarkAsReadRequest {
  id: string
}

/**
 * Batch mark as read request
 */
interface MarkMultipleAsReadRequest {
  ids: string[]
}

/**
 * Dismiss notification request
 */
interface DismissNotificationRequest {
  id: string
}

/**
 * Query key factory for consistent cache key generation
 */
const notificationQueryKeys = {
  all: () => ['notifications'],
  withFilters: (unreadOnly: boolean) => ['notifications', { unreadOnly }],
}

/**
 * Fetch real-time notifications with polling and provide mutations for interaction
 *
 * Features:
 * - Automatic polling every 30 seconds (configurable)
 * - Refetch on window focus for fresh data
 * - Stale-while-revalidate strategy: 30s stale, 2min gc
 * - Caps notifications at 20 most recent entries
 * - Unread count computed from notification state
 * - Mark-as-read mutation with optimistic updates
 * - Support for filtering by unread status
 * - Exponential backoff retry logic
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    refetchInterval = 30 * 1000, // 30 seconds
    refetchOnWindowFocus = true,
    unreadOnly = false,
  } = options

  const queryClient = useQueryClient()
  const queryKey = notificationQueryKeys.withFilters(unreadOnly)

  // Query to fetch notifications with polling
  const query = useQuery<NotificationCenter, Error>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (unreadOnly) {
        params.append('unread', 'true')
      }

      const response = await fetch(`/api/notifications?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.statusText}`)
      }

      const data = (await response.json()) as NotificationCenter

      // Cap notifications at 20 most recent entries
      if (data.notifications.length > 20) {
        data.notifications = data.notifications.slice(0, 20)
      }

      return data
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes (was cacheTime in v4)
    refetchInterval, // Polling configuration
    refetchOnWindowFocus, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch when connection is restored
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })

  // Mutation for marking a notification as read
  const markAsReadMutation = useMutationWithRetry<Notification, MarkAsReadRequest>({
    mutationFn: async ({ id }) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Failed to mark notification as read: ${response.statusText}`)
      }

      return response.json() as Promise<Notification>
    },
    onMutate: async ({ id }) => {
      // Cancel any pending requests for notifications
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all() })

      // Snapshot current query cache (for the actual unreadOnly setting)
      const previousData = queryClient.getQueryData<NotificationCenter>(queryKey)

      // Also snapshot the alternate unreadOnly state for restoration
      const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
      const previousAlternateData = queryClient.getQueryData<NotificationCenter>(alternateKey)

      // Optimistically update current cache (with actual unreadOnly value)
      if (previousData) {
        const updated = {
          ...previousData,
          notifications: previousData.notifications.map((notif) =>
            notif.id === id ? { ...notif, read: true } : notif
          ),
          unreadCount: Math.max(0, previousData.unreadCount - 1),
        }
        queryClient.setQueryData(queryKey, updated)
      }

      // Also update alternate unreadOnly state (remove from unread-only if currently showing all, or remove if showing unread-only)
      if (previousAlternateData) {
        if (unreadOnly) {
          // Currently showing unreadOnly: true, so also update unreadOnly: false
          queryClient.setQueryData(alternateKey, (old?: NotificationCenter) => {
            if (!old) return old
            return {
              ...old,
              notifications: old.notifications.map((notif) =>
                notif.id === id ? { ...notif, read: true } : notif
              ),
              unreadCount: old.unreadCount, // Count stays same since we're updating "all" list
            }
          })
        } else {
          // Currently showing unreadOnly: false, so also update unreadOnly: true (remove the notification)
          queryClient.setQueryData(alternateKey, (old?: NotificationCenter) => {
            if (!old) return old
            return {
              ...old,
              notifications: old.notifications.filter((notif) => notif.id !== id),
              unreadCount: Math.max(0, old.unreadCount - 1),
            }
          })
        }
      }

      return { previousData, previousAlternateData }
    },
    onError: (_, __, context) => {
      // Revert optimistic updates on error - restore both cache states
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      if (context?.previousAlternateData) {
        const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
        queryClient.setQueryData(alternateKey, context.previousAlternateData)
      }
    },
  })

  // Mutation for marking multiple notifications as read
  const markMultipleAsReadMutation = useMutationWithRetry<Notification[], MarkMultipleAsReadRequest>({
    mutationFn: async ({ ids }) => {
      const response = await fetch('/api/notifications/read-batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      if (!response.ok) {
        throw new Error(`Failed to mark notifications as read: ${response.statusText}`)
      }

      return response.json() as Promise<Notification[]>
    },
    onMutate: async ({ ids }) => {
      // Cancel pending requests
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all() })

      // Snapshot both cache states
      const previousData = queryClient.getQueryData<NotificationCenter>(queryKey)
      const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
      const previousAlternateData = queryClient.getQueryData<NotificationCenter>(alternateKey)

      // Update current cache
      if (previousData) {
        const unreadReducedBy = previousData.notifications.filter((n) => ids.includes(n.id) && !n.read).length
        queryClient.setQueryData(queryKey, {
          ...previousData,
          notifications: previousData.notifications.map((notif) =>
            ids.includes(notif.id) ? { ...notif, read: true } : notif
          ),
          unreadCount: Math.max(0, previousData.unreadCount - unreadReducedBy),
        })
      }

      // Update alternate cache
      if (previousAlternateData) {
        if (unreadOnly) {
          // Remove marked notifications from unreadOnly: true cache
          queryClient.setQueryData(alternateKey, {
            ...previousAlternateData,
            notifications: previousAlternateData.notifications.filter((n) => !ids.includes(n.id)),
            unreadCount: Math.max(0, previousAlternateData.unreadCount - ids.length),
          })
        }
      }

      return { previousData, previousAlternateData }
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      if (context?.previousAlternateData) {
        const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
        queryClient.setQueryData(alternateKey, context.previousAlternateData)
      }
    },
  })

  // Mutation for dismissing a notification
  const dismissNotificationMutation = useMutationWithRetry<unknown, DismissNotificationRequest>({
    mutationFn: async ({ id }) => {
      const response = await fetch(`/api/notifications/${id}/dismiss`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Failed to dismiss notification: ${response.statusText}`)
      }

      return response.json()
    },
    onMutate: async ({ id }) => {
      // Cancel pending requests
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all() })

      // Snapshot both cache states
      const previousData = queryClient.getQueryData<NotificationCenter>(queryKey)
      const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
      const previousAlternateData = queryClient.getQueryData<NotificationCenter>(alternateKey)

      // Remove notification from current cache
      if (previousData) {
        const notificationToRemove = previousData.notifications.find((n) => n.id === id)
        const unreadReduction = notificationToRemove && !notificationToRemove.read ? 1 : 0

        queryClient.setQueryData(queryKey, {
          ...previousData,
          notifications: previousData.notifications.filter((n) => n.id !== id),
          total: Math.max(0, previousData.total - 1),
          unreadCount: Math.max(0, previousData.unreadCount - unreadReduction),
        })
      }

      // Remove from alternate cache too
      if (previousAlternateData) {
        const notificationToRemove = previousAlternateData.notifications.find((n) => n.id === id)
        const unreadReduction = notificationToRemove && !notificationToRemove.read ? 1 : 0

        queryClient.setQueryData(alternateKey, {
          ...previousAlternateData,
          notifications: previousAlternateData.notifications.filter((n) => n.id !== id),
          total: Math.max(0, previousAlternateData.total - 1),
          unreadCount: Math.max(0, previousAlternateData.unreadCount - unreadReduction),
        })
      }

      return { previousData, previousAlternateData }
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      if (context?.previousAlternateData) {
        const alternateKey = notificationQueryKeys.withFilters(!unreadOnly)
        queryClient.setQueryData(alternateKey, context.previousAlternateData)
      }
    },
  })

  /**
   * Mark a single notification as read (memoized)
   */
  const markAsRead = useCallback(
    (id: string) => {
      markAsReadMutation.mutate({ id })
    },
    [markAsReadMutation]
  )

  /**
   * Mark multiple notifications as read (returns mutation trigger)
   */
  const markMultipleAsRead = useCallback(
    (ids: string[]) => {
      markMultipleAsReadMutation.mutate({ ids })
    },
    [markMultipleAsReadMutation]
  )

  /**
   * Dismiss (delete) a notification (returns mutation trigger)
   */
  const dismissNotification = useCallback(
    (id: string) => {
      dismissNotificationMutation.mutate({ id })
    },
    [dismissNotificationMutation]
  )

  return {
    // Query state
    ...query,

    // Computed values
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    total: query.data?.total ?? 0,

    // Mark as read mutation state
    markAsReadLoading: markAsReadMutation.isPending,
    markAsReadError: markAsReadMutation.error,

    // Mark multiple as read mutation state
    markMultipleAsReadLoading: markMultipleAsReadMutation.isPending,
    markMultipleAsReadError: markMultipleAsReadMutation.error,

    // Dismiss notification mutation state
    dismissLoading: dismissNotificationMutation.isPending,
    dismissError: dismissNotificationMutation.error,

    // Actions
    markAsRead,
    markMultipleAsRead,
    dismissNotification,
  }
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>
