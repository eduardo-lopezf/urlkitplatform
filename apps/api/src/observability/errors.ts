/**
 * Error reporting with data scrubbing (research R8). `scrubEvent` keeps only what is needed to
 * diagnose (exception type, redacted message, stack frames without variables) and drops request
 * data, user, extras, breadcrumbs and contexts. A test proves no input field reaches the service.
 */
import type { ErrorEvent } from '@sentry/node';
import { redact } from '../privacy/logger.ts';

export function scrubEvent<E extends Partial<ErrorEvent>>(event: E): E {
  const exception = event.exception?.values?.map((ex) => ({
    ...(ex.type === undefined ? {} : { type: ex.type }),
    ...(ex.value === undefined ? {} : { value: redact(ex.value) }),
    ...(ex.stacktrace?.frames
      ? {
          stacktrace: {
            frames: ex.stacktrace.frames.map((f) => ({
              ...(f.filename === undefined ? {} : { filename: f.filename }),
              ...(f.function === undefined ? {} : { function: f.function }),
              ...(f.lineno === undefined ? {} : { lineno: f.lineno }),
              ...(f.colno === undefined ? {} : { colno: f.colno }),
              ...(f.in_app === undefined ? {} : { in_app: f.in_app }),
            })),
          },
        }
      : {}),
  }));
  const scrubbed: Partial<ErrorEvent> = {
    ...(event.event_id === undefined ? {} : { event_id: event.event_id }),
    ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }),
    ...(event.level === undefined ? {} : { level: event.level }),
    ...(event.platform === undefined ? {} : { platform: event.platform }),
    ...(event.release === undefined ? {} : { release: event.release }),
    ...(event.environment === undefined ? {} : { environment: event.environment }),
    ...(event.message === undefined ? {} : { message: redact(event.message) }),
    ...(exception ? { exception: { values: exception } } : {}),
    type: undefined,
  };
  return scrubbed as E;
}

/** Initialises Sentry only when SENTRY_DSN is set, with every automatic data source disabled. */
export async function initErrorReporting(env: NodeJS.ProcessEnv): Promise<void> {
  if (!env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: env.SENTRY_DSN,
    // Nothing collected automatically: no user, cookies, headers, bodies or query params.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    enableOpenTelemetrySetup: false, // our tracer provider stays ours; Sentry adds no spans
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubEvent(event),
  });
}

export async function reportError(error: unknown): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/node');
  Sentry.captureException(error);
}
