import { QueryClient } from '@tanstack/react-query'

/**
 * Cache invalidation strategies for common data mutations
 *
 * This module provides utilities for managing cache invalidation across
 * the application. It implements hierarchical invalidation patterns to
 * minimize redundant API calls while ensuring data consistency.
 */

/**
 * Query key factory for consistent cache management
 */
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.tasks.lists(), { ...filters }] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tasks.details(), id] as const,
  },
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.projects.lists(), { ...filters }] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },
  sprints: {
    all: ['sprints'] as const,
    lists: () => [...queryKeys.sprints.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.sprints.lists(), { ...filters }] as const,
    details: () => [...queryKeys.sprints.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.sprints.details(), id] as const,
    metrics: (id: string) => [...queryKeys.sprints.detail(id), 'metrics'] as const,
  },
  agents: {
    all: ['agents'] as const,
    lists: () => [...queryKeys.agents.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.agents.lists(), { ...filters }] as const,
    details: () => [...queryKeys.agents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.agents.details(), id] as const,
    analytics: (id: string) => [...queryKeys.agents.detail(id), 'analytics'] as const,
    history: (id: string) => [...queryKeys.agents.detail(id), 'history'] as const,
    workload: (id: string) => [...queryKeys.agents.detail(id), 'workload'] as const,
  },
  activities: {
    all: ['activities'] as const,
    lists: () => [...queryKeys.activities.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.activities.lists(), { ...filters }] as const,
  },
} as const

/**
 * Invalidation strategies for specific mutations
 */
export const invalidationStrategies = {
  /**
   * When a task is created or deleted, invalidate:
   * - All task lists and filters
   * - Sprint metrics (since they depend on tasks)
   * - Agent analytics (since they aggregate task data)
   */
  taskModified: async (queryClient: QueryClient) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.tasks.lists(),
    })
    await queryClient.invalidateQueries({
      queryKey: queryKeys.sprints.all,
    })
    await queryClient.invalidateQueries({
      queryKey: queryKeys.agents.all,
    })
  },

  /**
   * When task dependencies change, invalidate:
   * - The specific task
   * - All task lists (for ordering/validation)
   */
  taskDependenciesChanged: async (queryClient: QueryClient, taskId: string) => {
    queryClient.setQueryData(queryKeys.tasks.detail(taskId), (old: unknown) => old)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.tasks.lists(),
    })
  },

  /**
   * When a project is modified, invalidate its detail and lists
   */
  projectModified: async (queryClient: QueryClient, projectId?: string) => {
    if (projectId) {
      queryClient.setQueryData(queryKeys.projects.detail(projectId), (old: unknown) => old)
    }
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projects.lists(),
    })
  },

  /**
   * When a sprint is modified, invalidate:
   * - Sprint detail and metrics
   * - All task lists (for sprint filtering)
   */
  sprintModified: async (queryClient: QueryClient, sprintId?: string) => {
    if (sprintId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sprints.detail(sprintId),
      })
    }
    await queryClient.invalidateQueries({
      queryKey: queryKeys.sprints.lists(),
    })
    await queryClient.invalidateQueries({
      queryKey: queryKeys.tasks.lists(),
    })
  },

  /**
   * When agent data changes, invalidate agent queries
   */
  agentModified: async (queryClient: QueryClient, agentId?: string) => {
    if (agentId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.detail(agentId),
      })
    }
    await queryClient.invalidateQueries({
      queryKey: queryKeys.agents.lists(),
    })
  },

  /**
   * When activities change, invalidate activity lists
   */
  activitiesUpdated: async (queryClient: QueryClient) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.activities.lists(),
    })
  },
}

/**
 * Utility function to invalidate all caches
 * Use sparingly - typically only on logout or catastrophic errors
 */
export const invalidateAllCaches = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries()
}
