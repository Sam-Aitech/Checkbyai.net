import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "./apiError";
import { logger } from "../utils/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  const status = (err as any)?.status || (err as any)?.statusCode || 500;
  const message = (err as any)?.message || "Internal Server Error";

  logger.error({ err, status }, "Unhandled server error");

  res.status(status).json({
    success: false,
    error: status === 500 ? "Internal Server Error" : message,
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
