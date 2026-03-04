import { createFileRoute } from '@tanstack/react-router'
import { TaskBoard } from './board'
import { SprintsSearchParamSchema } from '../../lib/router-types'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'

export const Route = createFileRoute('/sprints/')({
  component: TaskBoard,
  validateSearch: (search): Record<string, unknown> => {
    try {
      return SprintsSearchParamSchema.parse(search)
    } catch (error) {
      console.warn('Invalid search parameters:', error)
      return {}
    }
  },
  errorComponent: ({ error }) => (
    <RouteErrorBoundary error={error} />
  ),
})
