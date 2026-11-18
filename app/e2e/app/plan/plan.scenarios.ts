import { GROWTH_MONTHLY } from '../_support/fixtures/build-kaiten-cloud-plan';
import {
  PLAN_SESSION_REFUSALS,
  PlanAppModel,
  type PlanSessionRefusal,
} from '../_support/model/plan-app-model';

/**
 * Northwind Software, the organization the console runs for, on Kaiten Cloud: on Cloud
 * Starter (free, by the month) since September, with a Visa card on file and three
 * invoices of $0.00. Kaiten Cloud's catalogue sells Cloud Growth, $79.00 a month or
 * $790.00 a year, which a checkout moves it to and charges to that card.
 */
export function createPlanModel() {
  return new PlanAppModel();
}

/**
 * The same organization once it moved to Cloud Growth by the month on November 1st,
 * through the model's own checkout: a paid subscription, the $79.00 invoice it was
 * charged, and a catalogue that offers Cloud Starter, which Kaiten Cloud refuses to
 * check out over a paid subscription (`CreateSessionCheckout.AlreadySubscribed`).
 */
export function createGrowthPlanModel() {
  const model = new PlanAppModel();
  model.checkout(
    { licensePriceId: GROWTH_MONTHLY.id },
    Date.parse('2026-11-01T00:00:00Z'),
  );

  return model;
}

/** An organization saas-api mints no session for, for the reason given. */
export function createPlanSessionRefusedModel(refusal: PlanSessionRefusal) {
  return new PlanAppModel({ sessionRefusal: refusal });
}

/**
 * Kaiten Cloud out of reach once, then back: the first session is refused with a 503,
 * and the page's "Try again" mints one.
 */
export function createPlanUnavailableOnceModel() {
  const model = new PlanAppModel();
  model.armProblem('createPlanSession', PLAN_SESSION_REFUSALS.unavailable);

  return model;
}
