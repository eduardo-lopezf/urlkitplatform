/**
 * Operator CLI (003, research R7, contracts/admin-cli.md). It is not part of the public API or
 * the web: it runs inside the API container, against the database this service owns.
 *
 *   docker compose exec api node apps/api/src/admin/cli.ts <command> [arguments] [--json]
 *   pnpm --filter @urlkit/api admin <command> [arguments] [--json]
 *
 * It never prints a secret except the new key in `key create`. Exit codes: 0 done, 1 invalid
 * arguments or not found (nothing changed), 2 the database does not answer.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateKey, hashSecret } from '../auth/key-format.ts';
import { DuplicateNameError, type KeyStore, type Organization } from '../auth/key-store.ts';
import type { Plan } from '../quota/types.ts';
import { pruneUsage } from '../usage/prune.ts';
import type { UsageStore } from '../usage/record.ts';

export interface CliDeps {
  store: KeyStore;
  usage: UsageStore;
  plans: readonly Plan[];
  out(line: string): void;
  err(line: string): void;
}

/** A mistake of the operator: exit code 1 and nothing changed. */
class UsageError extends Error {}

const OPTIONS = {
  name: { type: 'string' },
  plan: { type: 'string' },
  note: { type: 'string' },
  json: { type: 'boolean' },
  all: { type: 'boolean' },
  from: { type: 'string' },
  to: { type: 'string' },
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const USAGE = [
  'Uso: cli.ts <orden> [argumentos] [--json]',
  '  plans list',
  '  org create --name <nombre> --plan <plan> [--note <nota>]',
  '  org set-plan <org> --plan <plan>',
  '  org list [--all]',
  '  org deactivate <org>',
  '  org activate <org>',
  '  key create <org>',
  '  key list <org>',
  '  key revoke <key-id>',
  '  usage show <org> [--from AAAA-MM-DD] [--to AAAA-MM-DD]',
  '  usage prune',
].join('\n');

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    deps.err(`${(error as Error).message}\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;
  const [group, action, target] = positionals;
  const print = (data: unknown, text: string[]) => {
    if (values.json) deps.out(JSON.stringify(data, null, 2));
    else for (const line of text) deps.out(line);
  };
  const organization = async (ref: string | undefined): Promise<Organization> => {
    if (!ref) throw new UsageError(`Falta la organización.\n${USAGE}`);
    const found = await deps.store.findOrganization(ref);
    if (!found) throw new UsageError(`No existe la organización «${ref}».`);
    return found;
  };
  const planIds = deps.plans.map((p) => p.id);
  const plan = (id: string | undefined) => {
    if (!id) throw new UsageError(`Falta --plan.\n${USAGE}`);
    if (!planIds.includes(id))
      throw new UsageError(`No existe el plan «${id}». Planes: ${planIds.join(', ')}.`);
    return id;
  };

  try {
    switch (`${group} ${action}`) {
      case 'plans list': {
        print(
          { plans: deps.plans.map((p) => ({ id: p.id, limits: p.limits })) },
          deps.plans.map(
            (p) =>
              `${p.id}: ${Object.entries(p.limits)
                .map(
                  ([bucket, w]) =>
                    `${bucket} ${Object.entries(w)
                      .map(([k, n]) => `${n}/${k}`)
                      .join(' ')}`,
                )
                .join(', ')}`,
          ),
        );
        return 0;
      }
      case 'org set-plan': {
        const org = await organization(target);
        const next = plan(values.plan);
        await deps.store.setPlan(org.id, next);
        print({ id: org.id, name: org.name, previous: org.planId, plan: next }, [
          `${org.name}: plan ${org.planId} → ${next}. Se aplica en menos de un minuto.`,
        ]);
        return 0;
      }
      case 'org create': {
        if (!values.name) throw new UsageError(`Falta --name.\n${USAGE}`);
        const org = await deps.store.createOrganization({
          name: values.name,
          planId: plan(values.plan),
          ...(values.note === undefined ? {} : { note: values.note }),
        });
        print({ id: org.id, name: org.name, plan: org.planId, status: org.status }, [
          `Organización creada: ${org.name} (plan ${org.planId}, id ${org.id}).`,
        ]);
        return 0;
      }
      case 'org list': {
        const orgs = await deps.store.listOrganizations({ all: values.all === true });
        print(
          {
            organizations: orgs.map((o) => ({
              id: o.id,
              name: o.name,
              plan: o.planId,
              status: o.status,
              activeKeys: o.activeKeys,
            })),
          },
          orgs.length
            ? orgs.map(
                (o) => `${o.name}  plan ${o.planId}  ${o.status}  claves activas: ${o.activeKeys}`,
              )
            : ['No hay organizaciones.'],
        );
        return 0;
      }
      case 'key create': {
        const org = await organization(target);
        const key = generateKey();
        await deps.store.createKey(org.id, key.id, hashSecret(key.secret));
        print({ id: key.id, key: key.key, organization: org.name }, [
          `Clave creada para ${org.name} (id ${key.id}):`,
          key.key,
          'Guárdala ahora: no se volverá a mostrar.',
        ]);
        return 0;
      }
      case 'key list': {
        const org = await organization(target);
        const keys = await deps.store.listKeys(org.id);
        print(
          {
            keys: keys.map((k) => ({
              id: k.id,
              createdAt: iso(k.createdAt),
              revokedAt: iso(k.revokedAt),
            })),
          },
          keys.length
            ? keys.map(
                (k) =>
                  `${k.id}  creada ${iso(k.createdAt)}  ${k.revokedAt ? `revocada ${iso(k.revokedAt)}` : 'activa'}`,
              )
            : [`${org.name} no tiene claves.`],
        );
        return 0;
      }
      case 'org deactivate':
      case 'org activate': {
        const org = await organization(target);
        const status = action === 'deactivate' ? 'inactive' : 'active';
        await deps.store.setStatus(org.id, status);
        print({ id: org.id, name: org.name, status }, [
          `${org.name}: ${status === 'inactive' ? 'desactivada; sus claves dejan de funcionar' : 'reactivada'} en menos de un minuto.`,
        ]);
        return 0;
      }
      case 'key revoke': {
        if (!target) throw new UsageError(`Falta el id de la clave.\n${USAGE}`);
        const key = await deps.store.revokeKey(target);
        if (!key) throw new UsageError(`No existe la clave «${target}».`);
        print({ id: key.id, revokedAt: iso(key.revokedAt) }, [
          `Clave ${key.id} revocada (${iso(key.revokedAt)}). Deja de funcionar en menos de un minuto.`,
        ]);
        return 0;
      }
      case 'usage show': {
        const org = await organization(target);
        for (const day of [values.from, values.to])
          if (day !== undefined && !DAY.test(day))
            throw new UsageError(`Fecha no válida: «${day}». Usa AAAA-MM-DD.`);
        const rows = await deps.usage.read(org.id, values.from, values.to);
        const total = rows.reduce((sum, r) => sum + r.count, 0);
        print({ organization: org.name, rows, total }, [
          ...rows.map((r) => `${r.day}  ${r.keyId}  ${r.bucket}  ${r.count}`),
          `Total: ${total}`,
        ]);
        return 0;
      }
      case 'usage prune': {
        const deleted = await pruneUsage(deps.usage);
        print({ deleted }, [`Recuentos de más de 13 meses borrados: ${deleted}.`]);
        return 0;
      }
      default:
        throw new UsageError(USAGE);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      deps.err(error.message);
      return 1;
    }
    if (error instanceof DuplicateNameError) {
      deps.err('Ya existe una organización con ese nombre.');
      return 1;
    }
    deps.err('La base de datos no responde.');
    return 2;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL.');
    process.exitCode = 2;
    return;
  }
  const [{ createDb }, { createPgKeyStore }, { createPgUsageStore }, { PLAN_LIST }] =
    await Promise.all([
      import('../db/client.ts'),
      import('../db/key-store.ts'),
      import('../db/usage-store.ts'),
      import('../quota/plans.ts'),
    ]);
  const db = createDb(url);
  try {
    process.exitCode = await runCli(process.argv.slice(2), {
      store: createPgKeyStore(db.kysely),
      usage: createPgUsageStore(db.kysely),
      plans: PLAN_LIST,
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => console.error(line),
    });
  } finally {
    await db.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) await main();
