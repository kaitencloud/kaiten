import { z } from 'zod';
import type {
  PagePublishableKey,
  PublishableKey,
  PublishableKeyCreated,
  PublishableKeyDraft,
  PublishableKeyPatch,
} from '@/api-client';
import { zPublishableKey } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { type PageRequest, pageOfRows } from './billing-pages';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

/** A record of the contract the model changes in place: the contract marks its generated members readonly. */
type Editable<T> = { -readonly [K in keyof T]: T[K] };

/** What the mocks arm to fail with a problem document, once. */
export type PublishableKeyOperation =
  | 'createPublishableKey'
  | 'listPublishableKeys'
  | 'revokePublishableKey'
  | 'updatePublishableKey';

export type BillingPublishableKeysSeed = {
  keys?: PublishableKey[];
};

export type SerializedBillingPublishableKeys = {
  armedProblems: Array<[PublishableKeyOperation, ArmedBillingProblem]>;
  keys: PublishableKey[];
  sequence: number;
};

// The bounds the API holds a key to (api/internal/modules/publicsdk/keys).
const MAX_LABEL_LENGTH = 100;
const MAX_ORIGINS = 50;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const unprocessable = (code: string, detail: string) =>
  new BillingProblem(422, code, detail);

/** The label as the API keeps it: trimmed, one to a hundred characters. */
function validateLabel(operation: string, label: string): string {
  const trimmed = label.trim();
  const length = Array.from(trimmed).length;

  if (length < 1 || length > MAX_LABEL_LENGTH) {
    throw unprocessable(
      `${operation}.InvalidLabel`,
      `label must be 1 to ${MAX_LABEL_LENGTH} characters`,
    );
  }

  return trimmed;
}

/**
 * An origin as a browser sends it, `scheme://host[:port]`: https, or http for
 * localhost. It has no path, not even `/`, since a browser never sends one and an
 * entry with one would never match; anything after the host, or a user, makes it
 * no origin.
 */
function normalizeOrigin(raw: string): string | undefined {
  const match = /^(https?):\/\/([^\s/?#@]+)$/i.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const hostname = host.replace(/:\d+$/, '');

  if (scheme === 'http' && !LOCAL_HOSTS.has(hostname)) {
    return undefined;
  }
  if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/.test(host)) {
    return undefined;
  }

  return `${scheme}://${host}`;
}

/** The origins as the API keeps them: checked, lower-cased, without duplicates, in the order given. */
function normalizeOrigins(operation: string, origins: string[]): string[] {
  if (origins.length > MAX_ORIGINS) {
    throw unprocessable(
      `${operation}.TooManyOrigins`,
      `at most ${MAX_ORIGINS} allowed origins`,
    );
  }
  const kept: string[] = [];

  for (const raw of origins) {
    const origin = normalizeOrigin(raw);
    if (!origin) {
      throw unprocessable(
        `${operation}.InvalidOrigin`,
        `${JSON.stringify(raw)} is not an origin: expected https://host[:port], or http://localhost[:port]`,
      );
    }
    if (!kept.includes(origin)) {
      kept.push(origin);
    }
  }

  return kept;
}

const notFound = (operation: string, id: string) =>
  new BillingProblem(
    404,
    `${operation}.NotFound`,
    `publishable key ${id} not found`,
  );

/**
 * The publishable keys of the organization, as the Core API serves them
 * (api/internal/modules/publicsdk): the label and the origins checked in the same order
 * with the same codes, a revoked key that cannot change, a revocation that is final and
 * answers the same again. A key is shown once, in the answer to its creation; the model
 * keeps its last four characters and nothing else, so that what a page persists of the
 * model never holds one.
 */
export class BillingPublishableKeys {
  private readonly problems = new ArmedProblems<PublishableKeyOperation>();
  private keys: Editable<PublishableKey>[];
  private sequence = 1;
  private clock: () => number = () => Date.now();

  constructor(seed: BillingPublishableKeysSeed = {}) {
    this.keys = parseContract(
      z.array(zPublishableKey),
      seed.keys ?? [],
      'BillingPublishableKeys seed.keys',
    ).map(clone);
  }

  static fromSerialized(
    state: SerializedBillingPublishableKeys,
  ): BillingPublishableKeys {
    const model = new BillingPublishableKeys({ keys: state.keys });
    model.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingPublishableKeys {
    return {
      armedProblems: this.problems.serialize(),
      keys: clone(this.keys),
      sequence: this.sequence,
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: PublishableKeyOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  /** Where the keys read the time, for a spec that freezes it. */
  setClock(now: () => number) {
    this.clock = now;
  }

  /** Every key, revoked ones included, for a spec that asserts what the model holds. */
  snapshot(): PublishableKey[] {
    return clone(this.keys);
  }

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  private require(operation: string, id: string): Editable<PublishableKey> {
    const key = this.keys.find((candidate) => candidate.id === id);
    if (!key) {
      throw notFound(operation, id);
    }

    return key;
  }

  /** `GET /publishable-keys`: newest first, a cursor per page; the revoked ones on request. Never the key. */
  listKeys(includeRevoked = false, page: PageRequest = {}): PagePublishableKey {
    this.problems.consume('listPublishableKeys');

    const rows = this.keys
      .filter((key) => includeRevoked || !key.revokedAt)
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.id.localeCompare(a.id),
      )
      .map(clone);

    return pageOfRows(rows, page, 'PublishableKeys');
  }

  /** `POST /publishable-keys`: the key comes back once, with the record that keeps its last four characters. */
  createKey(draft: PublishableKeyDraft): PublishableKeyCreated {
    this.problems.consume('createPublishableKey');
    const operation = 'CreatePublishableKey';
    const label = validateLabel(operation, draft.label);
    const allowedOrigins = normalizeOrigins(operation, draft.allowedOrigins);

    const number = this.sequence;
    this.sequence += 1;
    // A plain, short stand-in: the real key is 43 random characters behind the same prefix.
    const secret = `pk_test_key_${String(number).padStart(4, '0')}`;
    const now = this.nowIso();
    const record: Editable<PublishableKey> = {
      allowedOrigins,
      createdAt: now,
      id: `publishable-key-${number}`,
      keyHint: secret.slice(-4),
      label,
      updatedAt: now,
    };
    this.keys.push(record);

    return { ...clone(record), key: secret };
  }

  /** `PATCH /publishable-keys/{keyId}`: a member left out stays as it is; no origins at all empties the list. */
  updateKey(id: string, patch: PublishableKeyPatch): PublishableKey {
    this.problems.consume('updatePublishableKey');
    const operation = 'UpdatePublishableKey';
    const label =
      patch.label === undefined
        ? undefined
        : validateLabel(operation, patch.label);
    const allowedOrigins =
      patch.allowedOrigins === undefined
        ? undefined
        : normalizeOrigins(operation, patch.allowedOrigins);
    const key = this.require(operation, id);

    if (key.revokedAt) {
      throw new BillingProblem(
        409,
        `${operation}.Revoked`,
        'a revoked publishable key cannot be changed',
      );
    }
    if (label !== undefined) {
      key.label = label;
    }
    if (allowedOrigins !== undefined) {
      key.allowedOrigins = allowedOrigins;
    }
    key.updatedAt = this.nowIso();

    return clone(key);
  }

  /** `POST /publishable-keys/{keyId}/revoke`: final, and the same answer when asked again. */
  revokeKey(id: string): PublishableKey {
    this.problems.consume('revokePublishableKey');
    const key = this.require('RevokePublishableKey', id);

    if (!key.revokedAt) {
      key.revokedAt = this.nowIso();
      key.updatedAt = key.revokedAt;
    }

    return clone(key);
  }
}
