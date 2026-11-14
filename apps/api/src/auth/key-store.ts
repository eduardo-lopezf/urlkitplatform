/**
 * Storage of organizations and API keys (003, data-model.md). The verifier and the admin CLI
 * depend on this interface; production uses PostgreSQL (`db/key-store.ts`), tests use
 * `MemoryKeyStore`, like `MemoryStore` for quotas. Only the hash of a secret is ever stored.
 */
export type OrganizationStatus = 'active' | 'inactive';

export interface Organization {
  id: string;
  name: string;
  note: string | null;
  planId: string;
  status: OrganizationStatus;
  createdAt: Date;
  deactivatedAt: Date | null;
}

export interface KeySummary {
  id: string;
  organizationId: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/** What the verifier needs to decide about one key. */
export interface KeyRecord extends KeySummary {
  secretHash: Buffer;
  organizationStatus: OrganizationStatus;
  planId: string;
}

/** A name already used by another organization (case-insensitive). */
export class DuplicateNameError extends Error {
  constructor() {
    super('organization name already exists');
  }
}

export interface KeyStore {
  findKey(id: string): Promise<KeyRecord | null>;
  createOrganization(input: { name: string; planId: string; note?: string }): Promise<Organization>;
  /** By id or by exact name. */
  findOrganization(ref: string): Promise<Organization | null>;
  listOrganizations(options?: {
    all?: boolean;
  }): Promise<Array<Organization & { activeKeys: number }>>;
  setPlan(organizationId: string, planId: string): Promise<void>;
  setStatus(organizationId: string, status: OrganizationStatus): Promise<void>;
  createKey(organizationId: string, id: string, secretHash: Buffer): Promise<KeySummary>;
  listKeys(organizationId: string): Promise<KeySummary[]>;
  /** Revoking twice keeps the first date; `null` if the key does not exist. */
  revokeKey(id: string): Promise<KeySummary | null>;
}

export class MemoryKeyStore implements KeyStore {
  private readonly organizations = new Map<string, Organization>();
  private readonly keys = new Map<string, KeySummary & { secretHash: Buffer }>();
  private sequence = 0;
  /** Set to make every call fail, as an unreachable database would. */
  failing = false;

  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private check() {
    if (this.failing) throw new Error('store unavailable');
  }

  async findKey(id: string): Promise<KeyRecord | null> {
    this.check();
    const key = this.keys.get(id);
    const org = key && this.organizations.get(key.organizationId);
    if (!key || !org) return null;
    return { ...key, organizationStatus: org.status, planId: org.planId };
  }

  async createOrganization(input: { name: string; planId: string; note?: string }) {
    this.check();
    const taken = [...this.organizations.values()].some(
      (o) => o.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (taken) throw new DuplicateNameError();
    const org: Organization = {
      id: `00000000-0000-4000-8000-${String(++this.sequence).padStart(12, '0')}`,
      name: input.name,
      note: input.note ?? null,
      planId: input.planId,
      status: 'active',
      createdAt: new Date(this.now()),
      deactivatedAt: null,
    };
    this.organizations.set(org.id, org);
    return org;
  }

  async findOrganization(ref: string) {
    this.check();
    return (
      this.organizations.get(ref) ??
      [...this.organizations.values()].find((o) => o.name === ref) ??
      null
    );
  }

  async listOrganizations(options: { all?: boolean } = {}) {
    this.check();
    return [...this.organizations.values()]
      .filter((o) => options.all || o.status === 'active')
      .map((o) => ({
        ...o,
        activeKeys: [...this.keys.values()].filter(
          (k) => k.organizationId === o.id && k.revokedAt === null,
        ).length,
      }));
  }

  async setPlan(organizationId: string, planId: string) {
    this.check();
    const org = this.organizations.get(organizationId);
    if (org) org.planId = planId;
  }

  async setStatus(organizationId: string, status: OrganizationStatus) {
    this.check();
    const org = this.organizations.get(organizationId);
    if (!org) return;
    org.status = status;
    org.deactivatedAt = status === 'inactive' ? new Date(this.now()) : null;
  }

  async createKey(organizationId: string, id: string, secretHash: Buffer) {
    this.check();
    const key = {
      id,
      organizationId,
      secretHash,
      createdAt: new Date(this.now()),
      revokedAt: null,
    };
    this.keys.set(id, key);
    return { id, organizationId, createdAt: key.createdAt, revokedAt: null };
  }

  async listKeys(organizationId: string) {
    this.check();
    return [...this.keys.values()]
      .filter((k) => k.organizationId === organizationId)
      .map(({ id, organizationId: org, createdAt, revokedAt }) => ({
        id,
        organizationId: org,
        createdAt,
        revokedAt,
      }));
  }

  async revokeKey(id: string) {
    this.check();
    const key = this.keys.get(id);
    if (!key) return null;
    key.revokedAt ??= new Date(this.now());
    return {
      id,
      organizationId: key.organizationId,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
    };
  }
}
