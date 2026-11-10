import { subjectHash } from '../privacy/subject-hash.ts';
import type { Subject } from './types.ts';

/** `{subjectType}:{subjectId}`: the subject type travels in every Valkey key. */
export function subjectKey(subject: Subject): string {
  switch (subject.type) {
    case 'anon-ip':
      return `anon-ip:${subject.hash}`;
    case 'api-key':
      return `api-key:${subject.keyId}`;
    case 'organization':
      return `organization:${subject.organizationId}`;
  }
}

/**
 * Identity resolution for the MVP: always the pseudonymised IP. An `Authorization` header is
 * accepted and ignored, because keys are declared in the contract but not active until v3.
 */
export function resolveSubject(ip: string, secret: string, now: Date): Subject {
  return { type: 'anon-ip', hash: subjectHash(ip, secret, now) };
}
