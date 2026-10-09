import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import {
  type RecordedGraphQL,
  recordGraphQL,
  recordWrites,
} from '../_support/assertions/requests';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
} from '../billing/lifecycle-world';
import { createPagedBilledInstancesModels } from './instances.scenarios';

// Where each subscription stands, read where the instances are listed: a Billing column
// on the list of instances and on the card of a customer's instances. The subscriptions
// are a document of their own (`Instance.billing` needs `read:billing`, and the API
// refuses a whole document when one scope is missing), asked for only once billing is
// on and the session may read it, one request for every page of the list. The lifecycle
// world has an instance for each state: Initech Production is active, Initech Trial on
// its trial, Initech Late past due, Initech Leaving set to cancel at the end of its
// period, Hooli Production ended, and Initech Fresh was never subscribed.

const EXPECTED = [
  ['Initech Production', 'ACTIVE', 'Active'],
  ['Initech Trial', 'TRIAL', 'Trial'],
  ['Initech Late', 'PAST_DUE', 'Past due'],
  ['Initech Leaving', 'ACTIVE', 'Cancels at period end'],
  ['Hooli Production', 'CANCELED', 'Canceled'],
] as const;

const PER_INSTANCE_BILLING = /\/api\/instances\/[^/]+\/billing$/;

/** How many times the page sent the document: the lists send others besides (the customers, the metadata fields). */
const sent = (requests: RecordedGraphQL[], operationName: string) =>
  requests.filter((request) => request.operationName === operationName);

test.describe('the Billing column of the lists of instances', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('says where each subscription stands, and a dash for an instance nobody subscribed', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createLifecycleBillingModel());
    const list = new InstancesListDriver(page);

    await list.goto();

    await expect(list.billingHeader()).toBeVisible();
    for (const [name, status, label] of EXPECTED) {
      await expect(list.billingBadge(name), name).toHaveText(label);
      await expect(list.billingBadge(name), name).toHaveAttribute(
        'data-status',
        status,
      );
    }
    // Not a badge: a dash, which a screen reader reads as what it means.
    await expect(list.billingBadge('Initech Fresh')).toHaveCount(0);
    await expect(list.notSubscribed('Initech Fresh')).toBeAttached();
    await expect(list.billingPlaceholders()).toHaveCount(0);
  });

  test('asks for the subscriptions apart from the instances, once for the page and never once per instance', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createLifecycleBillingModel());
    const graphql = recordGraphQL(page);
    const perInstance = recordWrites(page, PER_INSTANCE_BILLING, ['GET']);
    const list = new InstancesListDriver(page);

    await list.goto();
    await expect(list.billingBadge('Initech Late')).toHaveText('Past due');

    // The document of the instances is the one it has always been; the subscriptions
    // are a second, with the page variables of the first.
    expect(sent(graphql, 'GetInstancesWithRelations')).toEqual([
      { operationName: 'GetInstancesWithRelations', variables: { limit: 200 } },
    ]);
    expect(sent(graphql, 'GetInstancesBilling')).toEqual([
      { operationName: 'GetInstancesBilling', variables: { limit: 200 } },
    ]);
    // Eight instances, and not eight reads of a subscription.
    expect(perInstance).toEqual([]);
  });

  test('is on the card of the instances of a customer, for that customer only', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createLifecycleBillingModel());
    const customer = new CustomerDetailDriver(page);

    await customer.goto('initech');

    await expect(customer.instancesBillingHeader()).toBeVisible();
    await expect(customer.instanceBillingBadge('Initech Late')).toHaveText(
      'Past due',
    );
    await expect(customer.instanceBillingBadge('Initech Trial')).toHaveText(
      'Trial',
    );
    await expect(customer.instanceBillingBadge('Initech Leaving')).toHaveText(
      'Cancels at period end',
    );
    await expect(
      customer.instanceNotSubscribed('Initech Fresh'),
    ).toBeAttached();
    // Hooli is another customer: its instance is not on this card.
    await expect(page.getByText('Hooli Production')).toHaveCount(0);
  });

  test('is not there, and nothing is asked for, where billing is off', async ({
    page,
  }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    const graphql = recordGraphQL(page);
    const list = new InstancesListDriver(page);

    await list.goto();
    await list.expectRowsLoaded();
    await expect(list.billingHeader()).toHaveCount(0);

    const customer = new CustomerDetailDriver(page);
    await customer.goto('initech');
    await customer.expectInstanceVisible('Initech Late');
    await expect(customer.instancesBillingHeader()).toHaveCount(0);

    expect(sent(graphql, 'GetInstancesBilling')).toHaveLength(0);
  });

  test('is said in French with the words of the console', async ({ page }) => {
    await installBillingAppMocks(page, createLifecycleBillingModel());
    const list = new InstancesListDriver(page);
    await startInLanguage(page, 'fr');

    await list.goto();

    await expect(
      page.getByRole('columnheader', { name: 'Facturation' }),
    ).toBeVisible();
    await expect(list.billingBadge('Initech Production')).toHaveText('Actif');
    await expect(list.billingBadge('Initech Trial')).toHaveText('Essai');
    await expect(list.billingBadge('Initech Late')).toHaveText(
      'En retard de paiement',
    );
    await expect(list.billingBadge('Initech Leaving')).toHaveText(
      'Annulation en fin de période',
    );
    await expect(list.billingBadge('Hooli Production')).toHaveText('Annulé');
    await expect(
      list.notSubscribed('Initech Fresh', 'Pas d’abonnement'),
    ).toBeAttached();
  });

  test('has no WCAG A/AA violation, in either theme', async ({ page }) => {
    await installBillingAppMocks(page, createLifecycleBillingModel());
    const list = new InstancesListDriver(page);

    await list.goto();
    await expect(list.billingBadge('Initech Late')).toHaveText('Past due');

    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expect(list.billingBadge('Initech Late')).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('a session that cannot read billing keeps the list of instances', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    // Billing is on for the organization: what the session may read is the question.
    await installBillingAppMocks(page, createLifecycleBillingModel());
  });

  test('sends one document and shows no column to a session without read:billing', async ({
    page,
  }) => {
    await signInWithScopes(page, SESSION_SCOPES.instances);
    const graphql = recordGraphQL(page);
    const list = new InstancesListDriver(page);

    await list.goto();
    await list.expectRowsLoaded();
    await expect(list.instanceRow('Initech Late')).toBeVisible();

    await expect(list.billingHeader()).toHaveCount(0);
    // The list asked once, with the document it has always had, and nothing about billing.
    expect(sent(graphql, 'GetInstancesWithRelations')).toHaveLength(1);
    expect(sent(graphql, 'GetInstancesBilling')).toHaveLength(0);
  });

  test('sends a second document to a session that can read it, and shows the badges', async ({
    page,
  }) => {
    await signInWithScopes(page, SESSION_SCOPES.reader);
    const graphql = recordGraphQL(page);
    const list = new InstancesListDriver(page);

    await list.goto();

    await expect(list.billingBadge('Initech Late')).toHaveText('Past due');
    await expect(list.billingBadge('Initech Trial')).toHaveText('Trial');
    // A second document, for the whole page at once.
    expect(sent(graphql, 'GetInstancesWithRelations')).toHaveLength(1);
    expect(sent(graphql, 'GetInstancesBilling')).toHaveLength(1);
  });

  test('the same on the card of a customer: the instances without the column', async ({
    page,
  }) => {
    await signInWithScopes(page, SESSION_SCOPES.instances);
    const graphql = recordGraphQL(page);
    const customer = new CustomerDetailDriver(page);

    await customer.goto('initech');

    await customer.expectInstanceVisible('Initech Late');
    await expect(customer.instancesBillingHeader()).toHaveCount(0);
    expect(sent(graphql, 'GetInstancesBilling')).toHaveLength(0);
  });
});

test.describe('a list longer than a page', () => {
  test('asks for the subscriptions a page at a time, with the cursors of the API, and shows them all', async ({
    page,
  }) => {
    const { billing, instances } = createPagedBilledInstancesModels(450);
    await installInstanceAppMocks(page, instances);
    await installBillingAppMocks(page, billing);
    const graphql = recordGraphQL(page);
    const perInstance = recordWrites(page, PER_INSTANCE_BILLING, ['GET']);
    const list = new InstancesListDriver(page);

    await list.goto();
    await list.search('Instance 449');

    // From the third page of the subscriptions.
    await expect(list.billingBadge('Instance 449')).toHaveText('Active');
    await list.search('Instance 445');
    await expect(list.notSubscribed('Instance 445')).toBeAttached();
    await list.search('Instance 429');
    await expect(list.billingBadge('Instance 429')).toHaveText('Trial');

    expect(
      sent(graphql, 'GetInstancesBilling').map(({ variables }) => variables),
    ).toEqual([
      { limit: 200 },
      { cursor: '200', limit: 200 },
      { cursor: '400', limit: 200 },
    ]);
    expect(perInstance).toEqual([]);
  });
});
