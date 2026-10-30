export type FieldErrors = Record<string, string[]>;

/** Operational error with an HTTP status. Mapped to the JSON envelope by `app.onError`. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors?: FieldErrors;
  readonly isOperational = true;

  constructor(statusCode: number, message: string, errors?: FieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message = 'Bad request', errors?: FieldErrors) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }
  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new ApiError(413, message);
  }
  static unsupportedMediaType(message = 'Unsupported media type') {
    return new ApiError(415, message);
  }
  static validation(message = 'Invalid request data', errors?: FieldErrors) {
    return new ApiError(422, message, errors);
  }
  static server(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}
