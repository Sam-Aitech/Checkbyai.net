import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { ApiError } from "./apiError";

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      throw new ApiError(400, `${first.path.join(".")}: ${first.message}`);
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const first = result.error.errors[0];
      throw new ApiError(400, `${first.path.join(".")}: ${first.message}`);
    }
    req.query = result.data;
    next();
  };
}
