/**
 * Example test cases for useOptimisticUpdate hook
 *
 * These examples demonstrate how to test optimistic updates with TanStack Query.
 * To run these tests, you'll need:
 * - vitest or jest
 * - @testing-library/react
 * - @tanstack/react-query test utils
 *
 * Setup:
 * ```bash
 * npm install -D vitest @testing-library/react @testing-library/react-hooks msw
 * ```
 */

/**
 * Example 1: Basic optimistic update with rollback on error
 *
 * Scenario: User updates a task, sees optimistic update, then error occurs
 * Expected: Task reverts to previous state
 */
export const testOptimisticUpdateRollback = `
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOptimisticUpdate } from '../useOptimisticUpdate'
import { FC, ReactNode } from 'react'

const queryClient = new QueryClient()
const wrapper: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

test('rolls back optimistic update on error', async () => {
  const initialData = { id: '1', title: 'Task 1', status: 'backlog' }
  queryClient.setQueryData(['task', '1'], initialData)

  const { result } = renderHook(() =>
    useOptimisticUpdate({
      mutationFn: () => Promise.reject(new Error('Network error')),
      queryKey: ['task', '1'],
      optimisticData: (variables) => ({
        ...initialData,
        ...variables,
      }),
    }),
    { wrapper }
  )

  const updatedData = { status: 'in-progress' }

  await act(async () => {
    result.current.mutate(updatedData)
  })

  // Optimistic update should be visible
  let cachedData = queryClient.getQueryData(['task', '1'])
  expect(cachedData).toEqual({ ...initialData, ...updatedData })

  // Wait for error
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  // Should roll back to original
  cachedData = queryClient.getQueryData(['task', '1'])
  expect(cachedData).toEqual(initialData)
})
`

/**
 * Example 2: Successful optimistic update
 *
 * Scenario: User updates a task, sees optimistic update, mutation succeeds
 * Expected: Cache is updated with server response
 */
export const testOptimisticUpdateSuccess = `
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOptimisticUpdate } from '../useOptimisticUpdate'

const queryClient = new QueryClient()

test('updates cache on successful mutation', async () => {
  const initialData = { id: '1', title: 'Task 1', status: 'backlog' }
  const serverResponse = { id: '1', title: 'Updated Task', status: 'in-progress' }

  queryClient.setQueryData(['task', '1'], initialData)

  const { result } = renderHook(() =>
    useOptimisticUpdate({
      mutationFn: async () => serverResponse,
      queryKey: ['task', '1'],
      optimisticData: (variables) => ({
        ...initialData,
        ...variables,
      }),
    }),
    { wrapper: QueryClientProvider }
  )

  await act(async () => {
    result.current.mutate({ title: 'Updated Task', status: 'in-progress' })
  })

  // Cache should have server response
  const cachedData = queryClient.getQueryData(['task', '1'])
  expect(cachedData).toEqual(serverResponse)
})
`

/**
 * Example 3: Handling nested/related query invalidation
 *
 * Scenario: Updating a task should invalidate sprint metrics
 * Expected: Both task and sprint metrics queries are refreshed
 */
export const testOptimisticUpdateWithInvalidation = `
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOptimisticUpdate } from '../useOptimisticUpdate'
import { invalidationStrategies } from '../../lib/cacheInvalidation'

const queryClient = new QueryClient()

test('invalidates related queries on success', async () => {
  const taskData = { id: '1', title: 'Task', sprintId: 'sprint-1' }
  queryClient.setQueryData(['task', '1'], taskData)
  queryClient.setQueryData(['sprint', 'sprint-1', 'metrics'], { velocity: 10 })

  const { result } = renderHook(() =>
    useOptimisticUpdate({
      mutationFn: async () => ({ ...taskData, status: 'done' }),
      queryKey: ['task', '1'],
      optimisticData: (v) => ({ ...taskData, ...v }),
      onSuccess: async () => {
        await invalidationStrategies.sprintModified(queryClient, 'sprint-1')
      },
    }),
    { wrapper: QueryClientProvider }
  )

  await act(async () => {
    result.current.mutate({ status: 'done' })
  })

  // Verify sprint metrics was invalidated
  const metricsData = queryClient.getQueryData(['sprint', 'sprint-1', 'metrics'])
  expect(metricsData).toBeUndefined() // Should be cleared for refetch
})
`

/**
 * Example 4: MSW error simulation
 *
 * Scenario: Server returns validation error
 * Expected: Error is caught and optimistic update is rolled back
 */
export const testOptimisticUpdateWithValidationError = `
import { renderHook, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOptimisticUpdate } from '../useOptimisticUpdate'

const server = setupServer(
  http.patch('/api/tasks/:id', () => {
    return HttpResponse.json(
      {
        error: 'Task name already exists',
        code: 'DUPLICATE_NAME',
      },
      { status: 400 }
    )
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('handles validation errors', async () => {
  const queryClient = new QueryClient()
  const initialData = { id: '1', title: 'Task 1' }
  queryClient.setQueryData(['task', '1'], initialData)

  const { result } = renderHook(() =>
    useOptimisticUpdate({
      mutationFn: async ({ title }) => {
        const response = await fetch('/api/tasks/1', {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        })
        if (!response.ok) throw new Error(await response.text())
        return response.json()
      },
      queryKey: ['task', '1'],
      optimisticData: (v) => ({ ...initialData, ...v }),
    }),
    { wrapper: QueryClientProvider }
  )

  await act(async () => {
    result.current.mutate({ title: 'Existing Task' })
  })

  // Error should be set
  expect(result.current.isError).toBe(true)
  expect(result.current.error?.message).toContain('duplicate')

  // Optimistic update should be rolled back
  const cachedData = queryClient.getQueryData(['task', '1'])
  expect(cachedData).toEqual(initialData)
})
`
