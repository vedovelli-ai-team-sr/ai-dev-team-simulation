export interface Item {
  id: string
  title: string
  description: string
  updatedAt: string
}

export interface ItemsFilterParams {
  page?: number
  pageSize?: number
  sortBy?: string
}

export type ItemErrorType = 'NotFound' | 'ServerError' | 'NetworkError' | 'Unknown'

export class ItemError extends Error {
  constructor(
    public type: ItemErrorType,
    message: string,
  ) {
    super(message)
    this.name = 'ItemError'
  }

  static fromResponse(status: number, message: string): ItemError {
    if (status === 404) {
      return new ItemError('NotFound', message)
    }
    if (status >= 500) {
      return new ItemError('ServerError', message)
    }
    return new ItemError('Unknown', message)
  }

  static fromNetworkError(error: unknown): ItemError {
    return new ItemError('NetworkError', `Network error: ${error instanceof Error ? error.message : 'Unknown'}`)
  }
}
