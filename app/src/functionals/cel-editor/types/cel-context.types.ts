/**
 * The shape of a value a rule can read, in the terms a rule author thinks in
 * rather than the server's. Only the distinctions that change what the editor
 * should offer are kept: a `map` takes an arbitrary key where an `object` takes
 * one of a fixed set of fields, and `dyn` is the honest answer for a value
 * nobody declared a shape for.
 */
export type CelValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'map'
  | 'dyn';

/**
 * One name a rule may read, and whatever is reachable below it.
 *
 * Recursive, because the context is a tree: today it is two levels of
 * server-computed facts, and a customer-declared namespace will nest as deeply
 * as the customer nests it.
 */
export interface CelContextNode {
  name: string;
  type: CelValueType;
  description?: string;
  /** Named children, for an `object`. */
  fields?: CelContextNode[];
  /** The shape shared by every entry, for a `map`. */
  values?: CelContextNode | null;
  /**
   * Keys the map currently has. Advisory only — a map stays readable under any
   * key, so this drives suggestions and never rejection.
   */
  knownKeys?: string[];
  /**
   * Whether the value may be absent. CEL raises on a missing field rather than
   * returning false, so these are the ones worth guarding with `has()`.
   */
  optional?: boolean;
}

/**
 * One problem found in a rule, positioned so the editor can underline it.
 *
 * Line and column are 1-based, the convention Monaco uses. `endLine`/
 * `endColumn` are absent when only a point is known, and the editor then falls
 * back to underlining the word at the start position.
 */
export interface CelIssue {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Checks a rule and reports every problem with it. Async because the only
 * check that can see the whole truth — which entitlements this organization
 * actually has — runs on the server.
 *
 * The editor takes this as a prop rather than reaching for an API client
 * itself, so the module stays free of any dependency on how Kaiten is served.
 */
export type CelLinter = (
  rule: string,
  signal: AbortSignal,
) => Promise<CelIssue[]>;
