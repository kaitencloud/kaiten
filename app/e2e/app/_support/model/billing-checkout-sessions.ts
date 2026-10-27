import { z } from 'zod';
import type {
  CheckoutSessionAdmin,
  PageCheckoutSessionAdmin,
} from '@/api-client';
import { zCheckoutSessionAdmin } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { type PageRequest, pageOfRows } from './billing-pages';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

/** What the mocks arm to fail with a problem document, once. */
export type CheckoutSessionOperation =
  | 'getCheckoutSessionAdmin'
  | 'listCheckoutSessions';

export type BillingCheckoutSessionsSeed = {
  sessions?: CheckoutSessionAdmin[];
};

export type SerializedBillingCheckoutSessions = {
  armedProblems: Array<[CheckoutSessionOperation, ArmedBillingProblem]>;
  sessions: CheckoutSessionAdmin[];
};

/** What narrows the list, as the API takes it: `status` repeats, the e-mail in any case, the reference exactly. */
export type CheckoutSessionFilters = {
  clientReferenceId?: string | null;
  email?: string | null;
  status?: readonly string[];
};

/**
 * The anonymous checkouts of the organization as the vendor reads them
 * (`api/internal/modules/publicsdk`): newest first, a cursor per page, the filters
 * the API applies, and a checkout left open past its expiry read as abandoned. The
 * model only reads: a checkout is started, confirmed and completed on the public
 * surface, which the console does not use, so nothing here changes a checkout. A
 * checkout the API deleted (90 days after it closed) is simply not in the seed, and
 * answers 404 like any unknown id.
 */
export class BillingCheckoutSessions {
  private readonly problems = new ArmedProblems<CheckoutSessionOperation>();
  private readonly sessions: CheckoutSessionAdmin[];
  private clock: () => number = () => Date.now();

  constructor(seed: BillingCheckoutSessionsSeed = {}) {
    this.sessions = parseContract(
      z.array(zCheckoutSessionAdmin),
      seed.sessions ?? [],
      'BillingCheckoutSessions seed.sessions',
    ).map(clone);
  }

  static fromSerialized(
    state: SerializedBillingCheckoutSessions,
  ): BillingCheckoutSessions {
    const model = new BillingCheckoutSessions({ sessions: state.sessions });
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingCheckoutSessions {
    return {
      armedProblems: this.problems.serialize(),
      sessions: clone(this.sessions),
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(
    operation: CheckoutSessionOperation,
    problem: ArmedBillingProblem,
  ) {
    this.problems.arm(operation, problem);
  }

  /** Where the checkouts read the time, for a spec that freezes it. */
  setClock(now: () => number) {
    this.clock = now;
  }

  /** Every checkout as the API would serve it now, for a spec that asserts what the model holds. */
  snapshot(): CheckoutSessionAdmin[] {
    return this.sessions.map((session) => this.asRead(session));
  }

  /** A checkout still OPEN past its expiry reads ABANDONED. */
  private asRead(session: CheckoutSessionAdmin): CheckoutSessionAdmin {
    const lapsed =
      session.status === 'OPEN' &&
      Date.parse(session.expiresAt) <= this.clock();

    return clone(lapsed ? { ...session, status: 'ABANDONED' } : session);
  }

  /** `GET /checkout-sessions`: newest first, filtered as the API filters, a cursor per page. */
  listSessions(
    filters: CheckoutSessionFilters = {},
    page: PageRequest = {},
  ): PageCheckoutSessionAdmin {
    this.problems.consume('listCheckoutSessions');
    const statuses = filters.status ?? [];
    const email = filters.email?.toLowerCase();

    const rows = this.sessions
      .map((session) => this.asRead(session))
      .filter(
        (session) =>
          (statuses.length === 0 || statuses.includes(session.status)) &&
          (!email || session.email.toLowerCase() === email) &&
          (!filters.clientReferenceId ||
            session.clientReferenceId === filters.clientReferenceId),
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.sessionId.localeCompare(b.sessionId),
      );

    return pageOfRows(
      rows,
      page,
      'CheckoutSessions',
      (session) => session.sessionId,
    );
  }

  /** `GET /checkout-sessions/{sessionId}`: one checkout, 404 for an unknown or a deleted one. */
  getSession(sessionId: string): CheckoutSessionAdmin {
    this.problems.consume('getCheckoutSessionAdmin');
    const session = this.sessions.find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (!session) {
      throw new BillingProblem(
        404,
        'GetCheckoutSessionAdmin.NotFound',
        `checkout session ${sessionId} not found`,
      );
    }

    return this.asRead(session);
  }
}
