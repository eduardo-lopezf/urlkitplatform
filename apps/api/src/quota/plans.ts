/**
 * Plans of the API (003, research R4). They are declared in plans.json, versioned with the code
 * and validated by plans.schema.json; plans live here, never in the core. A bucket missing from a
 * plan falls back to `anonymous`, so no plan is ever unlimited (FR-025).
 */
import plansFile from './plans.json' with { type: 'json' };
import type { Logger } from '../privacy/logger.ts';
import type { Plan, QuotaBucket, QuotaWindow, Subject } from './types.ts';

type Limits = Plan['limits'];
const DECLARED = plansFile.plans as Record<
  string,
  Partial<Record<QuotaBucket, Partial<Record<QuotaWindow, number>>>>
>;

/** The plan of anonymous visitors, unchanged since the MVP. */
export const ANONYMOUS_PLAN: Plan = { id: 'anonymous', limits: DECLARED.anonymous as Limits };

const PLANS = new Map<string, Plan>(
  Object.entries(DECLARED).map(([id, limits]) => [
    id,
    { id, limits: { ...ANONYMOUS_PLAN.limits, ...limits } },
  ]),
);

/** The plans declared in plans.json, with the fallback to `anonymous` applied. */
export const PLAN_LIST: readonly Plan[] = [...PLANS.values()];

/** Ids of the plans declared in plans.json. */
export const PLAN_IDS: readonly string[] = [...PLANS.keys()];

/**
 * The plan that limits a subject. Anonymous visitors always get `anonymous`; an organization gets
 * its plan, or `anonymous` (with a `plan.unknown` warning) if plans.json no longer declares it.
 */
export function planFor(subject: Subject, planId?: string, logger?: Logger): Plan {
  if (subject.type === 'anon-ip' || planId === undefined) return ANONYMOUS_PLAN;
  const plan = PLANS.get(planId);
  if (plan) return plan;
  logger?.warn('plan.unknown', { code: planId });
  return ANONYMOUS_PLAN;
}
