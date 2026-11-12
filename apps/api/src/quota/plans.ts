import type { Plan, Subject } from './types.ts';

/** The only plan in the MVP (spec, Assumptions). Plans live here, never in the core. */
export const ANONYMOUS_PLAN: Plan = {
  id: 'anonymous',
  limits: {
    inspect: { hour: 10, day: 50 },
    local: { hour: 600 },
    metrics: { hour: 300 },
    // v2 network tools (002 research R9): same limits as Redirect Inspector, one bucket each.
    headers: { hour: 10, day: 50 },
    metadata: { hour: 10, day: 50 },
    tls: { hour: 10, day: 50 },
    dns: { hour: 10, day: 50 },
    security: { hour: 10, day: 50 },
  },
};

/** v3 will look up the plan of the key or organization; until then every subject is anonymous. */
export function planFor(_subject: Subject): Plan {
  return ANONYMOUS_PLAN;
}
