import { useItems, itemKeys } from '../hooks/queries/items'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ItemError } from '../types/item'

/**
 * Demo component showcasing TanStack Query patterns:
 * - Query key factory pattern for predictable cache keys
 * - MSW mocking for /api/items endpoint
 * - Stale-while-revalidate pattern with 5-minute stale time
 * - Automatic refetch on window focus
 * - Automatic deduplication across multiple instances
 * - Garbage collection: cached pages older than 10 minutes are automatically removed
 *
 * Note on Caching Behavior:
 * When you navigate between pages, TanStack Query caches each page separately using
 * the query key itemKeys.list({ page, pageSize }). Old pages remain in cache for
 * 10 minutes (gcTime) before being garbage collected. This enables instant navigation
 * back to previously viewed pages without refetching, but you can manually invalidate
 * a specific page with: queryClient.invalidateQueries({ queryKey: itemKeys.list({ page, pageSize }) })
 */
export function ItemsDemo() {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const { data, isLoading, error, isFetching } = useItems(page, pageSize)
  const queryClient = useQueryClient()

  const handleRefetch = () => {
    // Invalidate only this specific page
    queryClient.invalidateQueries({ queryKey: itemKeys.list({ page, pageSize }) })
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const itemError = error as ItemError | null

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Items Demo</h1>

      <div className="flex gap-2">
        <button
          onClick={handleRefetch}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          disabled={isLoading}
        >
          {isFetching ? 'Fetching...' : 'Refetch'}
        </button>
        <p className="text-sm text-gray-600">
          {isFetching && 'Background refetch in progress...'}
        </p>
      </div>

      {isLoading && <div className="text-gray-600">Loading items...</div>}

      {itemError && (
        <div className="text-red-600 space-y-2">
          <p className="font-semibold">Error: {itemError.message}</p>
          <p className="text-sm">Type: {itemError.type}</p>
          {itemError.type === 'NotFound' && (
            <p className="text-sm italic">This page of items could not be found.</p>
          )}
          {itemError.type === 'ServerError' && (
            <p className="text-sm italic">Server error. Please try again later.</p>
          )}
          {itemError.type === 'NetworkError' && (
            <p className="text-sm italic">Network connection issue. Check your internet.</p>
          )}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="border rounded p-4">
            <p className="text-sm text-gray-600 mb-2">
              Page {data.page} of {data.totalPages} • Total items: {data.total}
            </p>

            <div className="space-y-2 mb-4">
              {data.data.map((item) => (
                <div key={item.id} className="border-l-4 border-blue-500 pl-3 py-2">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    Updated: {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(Math.min(data.totalPages, page + 1))}
                disabled={page === data.totalPages}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded text-sm space-y-1">
            <p className="font-semibold">Query Key Pattern Example:</p>
            <p>
              <code className="bg-white px-1 rounded">
                itemKeys.list({'{'} page: {page}, pageSize: {pageSize} {'}'}
              </code>
            </p>
            <p className="text-gray-600 mt-2">
              This component demonstrates deduplication: multiple instances of ItemsDemo with the
              same page/pageSize will reuse the cached data from TanStack Query. Each page is cached
              separately and kept for 10 minutes before garbage collection.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
