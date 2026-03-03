/**
 * Example test cases for usePaginatedQuery hook
 *
 * These examples demonstrate how to test paginated queries with proper
 * state management and navigation.
 */

/**
 * Example 1: Basic pagination navigation
 *
 * Scenario: User navigates between pages
 * Expected: Query params update, data refetches with correct page
 */
export const testPaginationNavigation = `
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePaginatedQuery } from '../usePaginatedQuery'
import { FC, ReactNode } from 'react'

const queryClient = new QueryClient()
const wrapper: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

test('navigates to next page', async () => {
  const mockFetch = vi.fn(async ({ pageIndex, pageSize }) => ({
    data: Array.from({ length: pageSize }, (_, i) => ({
      id: \`item-\${pageIndex * pageSize + i}\`,
    })),
    total: 100,
    pageIndex,
    pageSize,
  }))

  const { result } = renderHook(
    () =>
      usePaginatedQuery({
        queryKey: ['items'],
        queryFn: mockFetch,
        initialPageSize: 10,
      }),
    { wrapper }
  )

  // Wait for initial load
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  expect(result.current.pageIndex).toBe(0)
  expect(result.current.canNextPage).toBe(true)

  // Navigate to next page
  act(() => {
    result.current.nextPage()
  })

  expect(result.current.pageIndex).toBe(1)

  // Navigate back
  act(() => {
    result.current.previousPage()
  })

  expect(result.current.pageIndex).toBe(0)
  expect(result.current.canPreviousPage).toBe(false)
})
`

/**
 * Example 2: Page size changes
 *
 * Scenario: User changes items per page
 * Expected: Returns to first page with new page size
 */
export const testPageSizeChange = `
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '../usePaginatedQuery'

test('resets to first page when page size changes', async () => {
  const mockFetch = vi.fn(async (pagination) => ({
    data: Array.from({ length: pagination.pageSize }, (_, i) => ({
      id: \`item-\${i}\`,
    })),
    total: 100,
    ...pagination,
  }))

  const { result } = renderHook(
    () =>
      usePaginatedQuery({
        queryKey: ['items'],
        queryFn: mockFetch,
        initialPageSize: 10,
      }),
    { wrapper }
  )

  await act(async () => {
    result.current.nextPage()
  })

  expect(result.current.pageIndex).toBe(1)

  act(() => {
    result.current.setPageSize(20)
  })

  // Should reset to page 0 with new size
  expect(result.current.pageIndex).toBe(0)
  expect(result.current.pageSize).toBe(20)
})
`

/**
 * Example 3: Page count calculation
 *
 * Scenario: Calculate total pages based on total items and page size
 * Expected: pageCount reflects ceil(total / pageSize)
 */
export const testPageCountCalculation = `
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '../usePaginatedQuery'

test('calculates page count correctly', async () => {
  const mockFetch = vi.fn(async (pagination) => ({
    data: [],
    total: 250,
    ...pagination,
  }))

  const { result } = renderHook(
    () =>
      usePaginatedQuery({
        queryKey: ['items'],
        queryFn: mockFetch,
        initialPageSize: 20,
      }),
    { wrapper }
  )

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  // 250 items / 20 per page = 12.5 → 13 pages
  expect(result.current.pageCount).toBe(13)
})
`

/**
 * Example 4: Go to specific page
 *
 * Scenario: User jumps directly to a specific page
 * Expected: Page index updates, bounds are respected
 */
export const testGoToPage = `
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '../usePaginatedQuery'

test('navigates to specific page with bounds checking', async () => {
  const mockFetch = vi.fn(async (pagination) => ({
    data: [],
    total: 100,
    ...pagination,
  }))

  const { result } = renderHook(
    () =>
      usePaginatedQuery({
        queryKey: ['items'],
        queryFn: mockFetch,
        initialPageSize: 10,
      }),
    { wrapper }
  )

  await act(async () => {
    result.current.gotoPage(5)
  })

  expect(result.current.pageIndex).toBe(5)

  // Attempting to go beyond bounds should clamp
  act(() => {
    result.current.gotoPage(100)
  })

  // 100 items / 10 per page = 10 pages (0-9 valid), max is 9
  expect(result.current.pageIndex).toBe(9)

  // Negative page should clamp to 0
  act(() => {
    result.current.gotoPage(-5)
  })

  expect(result.current.pageIndex).toBe(0)
})
`

/**
 * Example 5: Loading and error states with pagination
 *
 * Scenario: Handle loading and error states while paginating
 * Expected: States update appropriately during fetch
 */
export const testPaginationLoadingAndErrors = `
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '../usePaginatedQuery'

test('tracks loading and error states during pagination', async () => {
  const mockFetch = vi.fn(async ({ pageIndex }) => {
    await new Promise((resolve) => setTimeout(resolve, 50))

    if (pageIndex === 2) {
      throw new Error('Server error')
    }

    return {
      data: [{ id: 'item-1' }],
      total: 100,
      pageIndex,
      pageSize: 10,
    }
  })

  const { result } = renderHook(
    () =>
      usePaginatedQuery({
        queryKey: ['items'],
        queryFn: mockFetch,
        initialPageSize: 10,
      }),
    { wrapper }
  )

  // Initial load
  expect(result.current.isLoading).toBe(true)

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  expect(result.current.isLoading).toBe(false)
  expect(result.current.isError).toBe(false)

  // Navigate to error page
  act(() => {
    result.current.gotoPage(2)
  })

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  expect(result.current.isError).toBe(true)
  expect(result.current.error?.message).toContain('Server error')
})
`

/**
 * Example 6: Integration with filter params
 *
 * Scenario: Pagination works alongside filters
 * Expected: Query key includes filters, pagination resets on filter change
 */
export const testPaginationWithFilters = `
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '../usePaginatedQuery'

test('integrates with filter parameters', async () => {
  const mockFetch = vi.fn(async (pagination) => ({
    data: [],
    total: pagination.pageSize === 10 ? 50 : 100,
    ...pagination,
  }))

  const filters = { status: 'active' }

  const { result, rerender } = renderHook(
    ({ filters: f }) =>
      usePaginatedQuery({
        queryKey: ['items', f],
        queryFn: mockFetch,
        initialPageSize: 10,
      }),
    { initialProps: { filters }, wrapper }
  )

  await act(async () => {
    result.current.nextPage()
  })

  expect(result.current.pageIndex).toBe(1)

  // Change filter - new queryKey triggers reset
  rerender({ filters: { status: 'inactive' } })

  // Page resets due to new query key
  expect(result.current.pageIndex).toBe(0)
})
`
