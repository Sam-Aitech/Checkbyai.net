import pino from "pino";
import pinoHttp from "pino-http";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  }),
  base: { service: "checkbyai" },
});

/** Express middleware — logs each HTTP request at info level. */
export const httpLogger = pinoHttp({
  logger,
  // Don't log health checks — high-frequency noise
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});

/** Narrow an unknown catch value to a proper Error (or message string). */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : JSON.stringify(err));
}
