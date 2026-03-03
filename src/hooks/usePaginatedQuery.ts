import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useState, useCallback } from 'react'

/**
 * Paginated response structure
 */
export interface PaginatedResponse<TData> {
  data: TData[]
  total: number
  pageIndex: number
  pageSize: number
}

/**
 * State for pagination
 */
export interface PaginationState {
  pageIndex: number
  pageSize: number
}

/**
 * Return value for usePaginatedQuery hook
 */
export interface UsePaginatedQueryResult<TData> {
  data: TData[]
  total: number
  pageIndex: number
  pageSize: number
  pageCount: number
  isLoading: boolean
  isError: boolean
  error: Error | null
  canPreviousPage: boolean
  canNextPage: boolean
  gotoPage: (pageIndex: number) => void
  previousPage: () => void
  nextPage: () => void
  setPageSize: (pageSize: number) => void
}

/**
 * Options for usePaginatedQuery hook
 */
export interface UsePaginatedQueryOptions<TData>
  extends Omit<
    UseQueryOptions<PaginatedResponse<TData>, Error, PaginatedResponse<TData>>,
    'queryKey' | 'queryFn'
  > {
  queryKey: unknown[]
  queryFn: (pagination: PaginationState) => Promise<PaginatedResponse<TData>>
  initialPageSize?: number
  initialPageIndex?: number
}

/**
 * A type-safe hook for paginated queries with navigation helpers.
 *
 * Usage:
 * ```tsx
 * const {
 *   data,
 *   pageIndex,
 *   pageCount,
 *   nextPage,
 *   previousPage,
 *   isLoading,
 * } = usePaginatedQuery({
 *   queryKey: ['tasks', filters],
 *   queryFn: ({ pageIndex, pageSize }) =>
 *     fetch(`/api/tasks?page=${pageIndex}&size=${pageSize}`).then(r => r.json()),
 *   initialPageSize: 20,
 * })
 * ```
 */
export function usePaginatedQuery<TData>({
  queryKey,
  queryFn,
  initialPageSize = 10,
  initialPageIndex = 0,
  ...queryOptions
}: UsePaginatedQueryOptions<TData>): UsePaginatedQueryResult<TData> {
  const [pageIndex, setPageIndex] = useState(initialPageIndex)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const pagination: PaginationState = { pageIndex, pageSize }

  const {
    data: response,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...queryOptions,
    queryKey: [...queryKey, { pageIndex, pageSize }],
    queryFn: () => queryFn(pagination),
  })

  const data = response?.data ?? []
  const total = response?.total ?? 0
  const pageCount = Math.ceil(total / pageSize)

  const gotoPage = useCallback((newPageIndex: number) => {
    setPageIndex(Math.max(0, Math.min(newPageIndex, pageCount - 1)))
  }, [pageCount])

  const previousPage = useCallback(() => {
    setPageIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const nextPage = useCallback(() => {
    setPageIndex((prev) => Math.min(pageCount - 1, prev + 1))
  }, [pageCount])

  const handleSetPageSize = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    // Reset to first page when page size changes
    setPageIndex(0)
  }, [])

  return {
    data,
    total,
    pageIndex,
    pageSize,
    pageCount,
    isLoading,
    isError,
    error: error as Error | null,
    canPreviousPage: pageIndex > 0,
    canNextPage: pageIndex < pageCount - 1,
    gotoPage,
    previousPage,
    nextPage,
    setPageSize: handleSetPageSize,
  }
}
