import pino from 'pino';

export interface LoggerConfig {
  level?: string;
  pretty?: boolean;
  name?: string;
}

export function createLogger(config: LoggerConfig = {}) {
  const { level = 'info', pretty = process.env.NODE_ENV !== 'production', name } = config;

  return pino({
    level,
    name,
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    }),
  });
}

export type Logger = ReturnType<typeof createLogger>;
