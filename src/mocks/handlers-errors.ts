import { http, HttpResponse } from 'msw'

/**
 * Error scenario handlers for testing error boundaries and retry mechanisms.
 * These handlers simulate:
 * - Network failures (500, 503)
 * - Validation errors (400, 422)
 * - Not found errors (404)
 * - Timeout scenarios
 */

export const errorHandlers = {
  /**
   * Task creation validation error - duplicate task name
   */
  taskValidationError: http.post('/api/tasks', () => {
    return HttpResponse.json(
      {
        error: 'Task with this name already exists',
        code: 'DUPLICATE_NAME',
      },
      { status: 400 }
    )
  }),

  /**
   * Task update server error - simulate transient failure
   */
  taskUpdateServerError: http.patch('/api/tasks/:id', () => {
    return HttpResponse.json(
      {
        error: 'Internal server error. Please try again.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }),

  /**
   * Task deletion not found error
   */
  taskNotFoundError: http.delete('/api/tasks/:id', () => {
    return HttpResponse.json(
      {
        error: 'Task not found',
        code: 'NOT_FOUND',
      },
      { status: 404 }
    )
  }),

  /**
   * Service unavailable - typical for temporary outages
   */
  serviceUnavailable: http.get('/api/tasks', () => {
    return HttpResponse.json(
      {
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
      },
      { status: 503 }
    )
  }),

  /**
   * Network timeout simulation using delay
   */
  networkTimeout: http.get('/api/tasks/:id', async () => {
    await new Promise((resolve) => setTimeout(resolve, 35000)) // 35 seconds
    return HttpResponse.json({ error: 'Request timeout' }, { status: 408 })
  }),

  /**
   * Validation error with detailed field errors
   */
  taskValidationWithFields: http.post('/api/tasks', () => {
    return HttpResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        fields: {
          name: 'Task name is required',
          team: 'Team must be one of: frontend, backend, devops',
          estimatedHours: 'Estimated hours must be a positive number',
        },
      },
      { status: 422 }
    )
  }),

  /**
   * Circular dependency error when updating task dependencies
   */
  circularDependencyError: http.put('/api/tasks/:id/dependencies', () => {
    return HttpResponse.json(
      {
        error: 'Circular dependency detected',
        code: 'CIRCULAR_DEPENDENCY',
        details: 'task-1 depends on task-2, but task-2 depends on task-1',
      },
      { status: 400 }
    )
  }),

  /**
   * Rate limit error
   */
  rateLimitError: http.post('/api/tasks', () => {
    return HttpResponse.json(
      {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60,
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }),

  /**
   * Unauthorized error
   */
  unauthorizedError: http.get('/api/tasks', () => {
    return HttpResponse.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    )
  }),

  /**
   * Forbidden error
   */
  forbiddenError: http.delete('/api/tasks/:id', () => {
    return HttpResponse.json(
      {
        error: 'Forbidden - insufficient permissions',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    )
  }),
}
