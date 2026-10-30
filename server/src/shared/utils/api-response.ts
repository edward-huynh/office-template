import { z } from 'zod';
import { ApiError, type FieldErrors } from '../errors/api-error.js';

export const ok = <T>(data: T) => ({ success: true as const, data });

/** Converts a zod error into the field error map used by the error envelope. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const flat = z.flattenError(error);
  const errors: FieldErrors = { ...flat.fieldErrors } as FieldErrors;
  if (flat.formErrors.length > 0) errors._ = flat.formErrors;
  return errors;
}

export function validationError(error: z.ZodError): ApiError {
  return ApiError.validation('Invalid request data', toFieldErrors(error));
}
