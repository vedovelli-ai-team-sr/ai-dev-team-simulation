import { createFileRoute } from '@tanstack/react-router'
import { useAgents } from '../../hooks/useAgents'
import { AgentCard } from '../../components/AgentCard'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'

/* eslint-disable react-refresh/only-export-components */
function AgentsDashboard(): JSX.Element {
  const { data: response, isLoading, error } = useAgents()
  const agents = response?.data ?? []

  if (isLoading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Agent Dashboard</h1>
        <div className="flex items-center justify-center py-16">
          <p className="text-slate-500">Loading agents...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <RouteErrorBoundary
        error={error}
        resetError={() => window.location.reload()}
      />
    )
  }

  if (agents.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Agent Dashboard</h1>
        <div className="flex items-center justify-center py-16">
          <p className="text-slate-500">No agents available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Agent Dashboard</h1>
          <p className="text-slate-600 text-sm sm:text-base">Manage and monitor your team agents</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/agents/')({
  component: AgentsDashboard,
  errorComponent: ({ error }) => (
    <RouteErrorBoundary error={error} />
  ),
})
