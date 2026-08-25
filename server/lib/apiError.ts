import type { ApiErrorCode } from "./response";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: ApiErrorCode,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
