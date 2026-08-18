type LogLevel = "info" | "warn" | "error" | "debug";

function serializeData(data: unknown, depth = 0): unknown {
  if (depth > 5) return String(data);
  if (data instanceof Error) {
    return {
      message: data.message,
      name: data.name,
      stack: data.stack,
      ...Object.fromEntries(Object.entries(data)),
    };
  }
  if (Array.isArray(data)) {
    return data.map((v) => serializeData(v, depth + 1));
  }
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [
        k,
        serializeData(v, depth + 1),
      ])
    );
  }
  return data;
}

function log(level: LogLevel, message: string, data?: unknown) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined ? { data: serializeData(data) } : {}),
  };

  const formatted = JSON.stringify(entry);

  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log("info", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
  debug: (message: string, data?: unknown) => {
    if (process.env.NODE_ENV === "development") {
      log("debug", message, data);
    }
  },
};
