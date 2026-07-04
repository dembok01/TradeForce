import "server-only";

type LogContext = Record<string, unknown>;

// Structured JSON lines so Vercel's log pipeline (and any future drain) can
// filter by level/route/key without parsing prose. Raw DB error details belong
// HERE, never in client responses.
function emit(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
