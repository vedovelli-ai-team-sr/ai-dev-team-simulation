/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'

function AgentsLayout(): JSX.Element {
  return <Outlet />
}

export const Route = createFileRoute('/agents')({
  component: AgentsLayout,
  errorComponent: ({ error }) => (
    <RouteErrorBoundary error={error} />
  ),
})
