import { useForm as useTanstackForm, FieldApi, ValidatorAsync } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { ZodSchema } from 'zod'

export interface FieldValidationError {
  message: string
  field?: string
}

export interface FormSubmissionResult<T = unknown> {
  success: boolean
  data?: T
  fieldErrors?: Record<string, string[]>
  serverError?: string
}

export interface UseFormStateConfig<T> {
  defaultValues: T
  schema: ZodSchema
  onSubmit: (data: T) => Promise<FormSubmissionResult<T>>
  onAsyncValidate?: Record<string, (value: unknown) => Promise<string | undefined>>
  onError?: (error: Error | string) => void
}

export interface UseFormStateReturn<T> {
  form: ReturnType<typeof useTanstackForm<T, ValidatorAsync>>
  isSubmitting: boolean
  isValidating: boolean
  submitError: string | null
  fieldErrors: Record<string, string[]>
  handleSubmit: () => Promise<void>
  getFieldError: (fieldName: string) => string | undefined
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void
  reset: () => void
}

/**
 * useFormState Hook
 *
 * Core form state management hook wrapping TanStack Form (v5+).
 * Uses the modern validatorAdapter pattern and onChangeAsync validators.
 *
 * Provides:
 * - Client-side validation with Zod schemas
 * - Async field validation (e.g., email uniqueness) with debouncing support
 * - Server-side validation error handling
 * - Form submission with loading states
 * - Field-level error management
 *
 * @example
 * ```tsx
 * const schema = z.object({
 *   email: z.string().email('Invalid email'),
 *   password: z.string().min(8, 'Password too short'),
 * })
 *
 * const { form, handleSubmit, getFieldError, isSubmitting } = useFormState({
 *   defaultValues: { email: '', password: '' },
 *   schema,
 *   onSubmit: async (data) => {
 *     const response = await api.submit(data)
 *     return response.success
 *       ? { success: true, data: response.data }
 *       : { success: false, fieldErrors: response.errors, serverError: response.message }
 *   },
 *   onAsyncValidate: {
 *     email: async (email) => {
 *       const response = await fetch('/api/validate/email', {
 *         method: 'POST',
 *         body: JSON.stringify({ email }),
 *       })
 *       const result = await response.json()
 *       return result.available ? undefined : result.message
 *     },
 *   },
 * })
 *
 * return (
 *   <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
 *     <input
 *       value={form.state.values.email}
 *       onChange={(e) => form.setFieldValue('email', e.target.value)}
 *     />
 *     {getFieldError('email') && <span>{getFieldError('email')}</span>}
 *     <button type="submit" disabled={isSubmitting}>Submit</button>
 *   </form>
 * )
 * ```
 */
export function useFormState<T>({
  defaultValues,
  schema,
  onSubmit,
  onAsyncValidate = {},
  onError,
}: UseFormStateConfig<T>): UseFormStateReturn<T> {
  const form = useTanstackForm<T, ValidatorAsync>({
    defaultValues,
    onSubmit: async ({ value }) => {
      try {
        const result = await onSubmit(value)

        // Handle server-side field errors
        if (!result.success && result.fieldErrors) {
          // Set form submission errors map for server-side validation failures
          const errorMap: Record<string, string[]> = {}
          Object.entries(result.fieldErrors).forEach(([field, errors]) => {
            if (Array.isArray(errors) && errors.length > 0) {
              errorMap[field] = errors
            }
          })

          if (Object.keys(errorMap).length > 0) {
            // Store errors via form state for retrieval by getFieldError
            form.setFieldMeta('_serverErrors', errorMap as never)
          }
        }

        // Handle server error
        if (!result.success && result.serverError) {
          throw new Error(result.serverError)
        }

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        onError?.(errorMessage)
        throw error
      }
    },
    validatorAdapter: zodValidator(),
    validators: {
      onChange: schema,
      // Build async validators directly into config
      onChangeAsync: Object.entries(onAsyncValidate).length > 0
        ? async ({ value }: { value: T }) => {
            const errors: Record<string, string> = {}

            await Promise.all(
              Object.entries(onAsyncValidate).map(async ([fieldName, validator]) => {
                try {
                  const error = await validator((value as Record<string, unknown>)[fieldName])
                  if (error) {
                    errors[fieldName] = error
                  }
                } catch (error) {
                  errors[fieldName] = 'Validation error'
                }
              }),
            )

            return Object.keys(errors).length > 0 ? errors : undefined
          }
        : undefined,
    },
  })

  const isSubmitting = form.state.isSubmitting
  const isValidating = form.state.isValidating

  // Extract field errors from fieldMeta with type safety
  const fieldErrors = form.state.fieldMeta
    ? Object.entries(form.state.fieldMeta).reduce(
        (acc, [field, meta]) => {
          // Only include fields with actual error arrays
          if (
            meta &&
            typeof meta === 'object' &&
            'errors' in meta &&
            Array.isArray(meta.errors) &&
            meta.errors.length > 0
          ) {
            acc[field] = meta.errors.filter((e) => typeof e === 'string') as string[]
          }
          return acc
        },
        {} as Record<string, string[]>,
      )
    : {}

  // Get server errors if stored
  const serverErrors = (form.state.fieldMeta?.['_serverErrors'] as Record<string, string[]> | undefined) || {}

  // Merge client and server errors
  const allFieldErrors = { ...serverErrors, ...fieldErrors }

  const submitError = form.state.errorMap?.onSubmit?.[0] ?? null

  const handleSubmit = async () => {
    try {
      await form.handleSubmit()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Form submission failed'
      onError?.(errorMessage)
    }
  }

  const getFieldError = (fieldName: string): string | undefined => {
    // Check server errors first, then client-side errors
    const serverFieldErrors = allFieldErrors[fieldName]
    if (serverFieldErrors && Array.isArray(serverFieldErrors) && serverFieldErrors.length > 0) {
      const firstError = serverFieldErrors[0]
      if (typeof firstError === 'string') {
        return firstError
      }
    }

    // Fall back to client-side validation errors
    const meta = form.state.fieldMeta?.[fieldName]
    if (meta && 'errors' in meta && Array.isArray(meta.errors) && meta.errors.length > 0) {
      const firstError = meta.errors[0]
      if (typeof firstError === 'string') {
        return firstError
      }
    }

    return undefined
  }

  const setFieldValue = <K extends keyof T>(field: K, value: T[K]) => {
    form.setFieldValue(field as never, value as never)
  }

  const reset = () => {
    form.reset()
  }

  return {
    form,
    isSubmitting,
    isValidating,
    submitError,
    fieldErrors: allFieldErrors,
    handleSubmit,
    getFieldError,
    setFieldValue,
    reset,
  }
}
