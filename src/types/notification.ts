/**
 * Notification types and interfaces for real-time notification center
 */

// Specific notification event types
export type NotificationEventType = 'assignment_changed' | 'sprint_updated' | 'task_reassigned' | 'deadline_approaching'

// Legacy notification types (kept for backward compatibility)
export type NotificationType = 'agent_event' | 'sprint_change' | 'performance_alert' | NotificationEventType

export interface Notification {
  id: string
  type: NotificationType
  message: string
  timestamp: string
  read: boolean
  metadata?: Record<string, unknown>
  // Optional fields for structured events
  eventType?: NotificationEventType
  relatedId?: string // ID of related entity (task, sprint, agent)
  priority?: 'low' | 'normal' | 'high'
}

export interface NotificationsResponse {
  data: Notification[]
  total: number
  unreadCount: number
}

/**
 * Notification center aggregated state
 */
export interface NotificationCenter {
  notifications: Notification[]
  unreadCount: number
  total: number
}
