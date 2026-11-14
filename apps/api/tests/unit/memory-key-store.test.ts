/** MemoryKeyStore has the behaviour every KeyStore must have (003/T017). */
import { describe } from 'vitest';
import { MemoryKeyStore } from '../../src/auth/key-store.ts';
import { keyStoreBehaviour } from '../key-store-behaviour.ts';

describe('MemoryKeyStore', () => keyStoreBehaviour(async () => new MemoryKeyStore()));
