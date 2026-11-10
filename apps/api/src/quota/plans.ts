import type { Plan, Subject } from './types.ts';

/** The only plan in the MVP (spec, Assumptions). Plans live here, never in the core. */
export const ANONYMOUS_PLAN: Plan = {
  id: 'anonymous',
  limits: { inspect: { hour: 10, day: 50 }, local: { hour: 600 }, metrics: { hour: 300 } },
};

/** v3 will look up the plan of the key or organization; until then every subject is anonymous. */
export function planFor(_subject: Subject): Plan {
  return ANONYMOUS_PLAN;
}
