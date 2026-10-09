import type {
  ConnectorSettings,
  ConnectorSettingsWritable,
} from '@/api-client';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import {
  zConnectorSettings,
  zConnectorSettingsWritable,
} from '@/api-client/zod.gen';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing/logic/billing-providers';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync/constants';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

const STRIPE_KEY_PATTERN = /^rk_(live|test)_[A-Za-z0-9]+$/;
const STRIPE_SETTINGS = [
  'stripeSecretKey',
  'automaticTax',
  'taxBehavior',
  'autoFinalize',
] as const;

/**
 * A restricted key the mocks treat as the provider would: the words in the key
 * stand for what Stripe answers, so that a person using `dev:mock` reaches every
 * refusal by typing a key. Any other well-formed key is accepted.
 * - `rejected`: Stripe refuses the credentials;
 * - `offline`: Stripe cannot be reached to check them;
 * - `elsewhere`: the key reaches another account than the one the customers live in.
 */
const REFUSING_KEYS = {
  elsewhere: 'AccountChanged',
  rejected: 'CredentialsRejected',
  offline: 'ProviderUnavailable',
} as const;

/** What the Stripe connector needs of billing: the world its rules are checked against. */
export type StripeConnectorWorld = {
  /** Whether Stripe holds customers of the organization: a key of another account would orphan them. */
  hasMappedCustomers: () => boolean;
  /** The connector was activated, and which account the key reaches. */
  onConnected: (livemode: boolean) => void;
  /** The connector was deactivated. */
  onDisconnected: () => void;
  /** What still routes to Stripe: what keeps the connector from being disconnected. */
  routing: () => { activeSubscriptions: number; openInvoices: number };
  /** Whether the organization may connect it here, and why not. */
  standing: () => 'available' | 'notEntitled' | 'vaultMissing';
};

/** What the mocks arm on the Stripe connector's operations. */
export type StripeConnectorOperation =
  | 'deactivateConnector'
  | 'getConnectorSettings'
  | 'updateConnectorSettings';

/** The Stripe connector as the organization left it. */
export type StripeConnectorState = {
  activated: boolean;
  /** Whether the stored key reaches the live account. */
  livemode: boolean;
  /** The settings with the key redacted, as the API returns them; none when nothing is stored. */
  settings: ConnectorSettings | null;
};

export type ConnectorAppModelSeed = {
  settings?: ConnectorSettings | null;
  stripe?: StripeConnectorState;
  syncedRecords?: GetAttioSyncedRecordsQuery;
};

export type SerializedConnectorAppModel = {
  armedProblems?: Array<[StripeConnectorOperation, ArmedBillingProblem]>;
  settings: ConnectorSettings | null;
  stripe?: StripeConnectorState;
  syncedRecords: GetAttioSyncedRecordsQuery;
};

const notFound = () =>
  Object.assign(new Error('Attio connector settings not found'), {
    httpStatus: 404,
  });

export class ConnectorAppModel {
  private readonly problems = new ArmedProblems<StripeConnectorOperation>();
  private settings: ConnectorSettings | null;
  private stripe: StripeConnectorState;
  private stripeWorld: StripeConnectorWorld | undefined;
  private readonly syncedRecords: GetAttioSyncedRecordsQuery;

  constructor(seed: ConnectorAppModelSeed = {}) {
    this.settings = seed.settings
      ? parseContract(
          zConnectorSettings,
          seed.settings,
          'ConnectorAppModel seed.settings',
        )
      : null;
    this.stripe = clone(
      seed.stripe ?? { activated: false, livemode: false, settings: null },
    );
    this.syncedRecords = clone(
      seed.syncedRecords ?? {
        customers: { items: [] },
        instances: { items: [] },
      },
    );
  }

  static fromSerialized(state: SerializedConnectorAppModel) {
    const model = new ConnectorAppModel(state);
    for (const [operation, problem] of state.armedProblems ?? []) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serializeForMsw(): SerializedConnectorAppModel {
    return {
      armedProblems: this.problems.serialize(),
      settings: clone(this.settings),
      stripe: clone(this.stripe),
      syncedRecords: clone(this.syncedRecords),
    };
  }

  /** Arm the next call of an operation on the Stripe connector to fail with a problem document. One-shot. */
  armProblem(
    operation: StripeConnectorOperation,
    problem: ArmedBillingProblem,
  ) {
    this.problems.arm(operation, problem);
  }

  /** Gives the Stripe connector the billing it keeps its rules against. */
  setStripeWorld(world: StripeConnectorWorld) {
    this.stripeWorld = world;
  }

  // --- The Stripe connector ------------------------------------------------------

  /** `GET /connectors/kaiten.integration.billing.stripe/settings`: the key is never returned. */
  getStripeSettings(): ConnectorSettings {
    this.problems.consume('getConnectorSettings');
    if (!this.stripe.settings) {
      throw new BillingProblem(
        404,
        'GetConnectorSettings.NotFound',
        'no settings are stored for this connector',
      );
    }

    return clone(this.stripe.settings);
  }

  private failStripeSettings(location: string, message: string): never {
    throw new BillingProblem(
      422,
      'UpdateConnectorSettings.InvalidPayloadSchema',
      'the connector settings are not valid',
      { errors: [{ location, message }] },
    );
  }

  /**
   * `PUT /connectors/kaiten.integration.billing.stripe/settings`, with the checks
   * the API makes in the order it makes them (updatesettings, then the hooks of
   * the provider connector): Vault, the entitlement, the schema, the credentials
   * and the account. Saving also activates the connector.
   */
  updateStripeSettings(body: ConnectorSettingsWritable): ConnectorSettings {
    const operation = 'UpdateConnectorSettings';
    this.problems.consume('updateConnectorSettings');
    const given = clone(body.settings ?? {});
    if (Object.keys(given).length === 0) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidPayload`,
        'Connector settings payload cannot be empty',
      );
    }
    const standing = this.stripeWorld?.standing() ?? 'available';
    if (standing === 'vaultMissing') {
      throw new BillingProblem(
        422,
        `${operation}.VaultNotConfigured`,
        'This connector stores its settings in Vault, and this deployment has none configured: set VAULT_ADDR',
      );
    }
    // A write-only field left out, redacted or empty keeps the stored value.
    const stored = this.stripe.settings?.settings;
    const typed = given.stripeSecretKey;
    const keeps = typed === undefined || typed === '***' || typed === '';
    for (const member of Object.keys(given)) {
      if (!(STRIPE_SETTINGS as readonly string[]).includes(member)) {
        this.failStripeSettings(
          `body.settings.${member}`,
          'unexpected property',
        );
      }
    }
    if (keeps && !stored) {
      this.failStripeSettings(
        'body.settings.stripeSecretKey',
        'stripeSecretKey is required',
      );
    }
    if (!keeps && !STRIPE_KEY_PATTERN.test(String(typed))) {
      this.failStripeSettings(
        'body.settings.stripeSecretKey',
        'does not match ^rk_(live|test)_[A-Za-z0-9]+$',
      );
    }
    if (
      given.taxBehavior !== undefined &&
      given.taxBehavior !== 'EXCLUSIVE' &&
      given.taxBehavior !== 'INCLUSIVE'
    ) {
      this.failStripeSettings(
        'body.settings.taxBehavior',
        'must be EXCLUSIVE or INCLUSIVE',
      );
    }
    if (standing === 'notEntitled') {
      throw new BillingProblem(
        403,
        'ActivateConnector.NotEntitled',
        "the organization's plan does not include this connector",
      );
    }
    if (!keeps) {
      this.checkStripeCredentials(String(typed));
    }

    const livemode = keeps
      ? this.stripe.livemode
      : String(typed).startsWith('rk_live_');
    this.stripe = {
      activated: true,
      livemode,
      settings: parseContract(
        zConnectorSettings,
        {
          connector_name: STRIPE_CONNECTOR_NAME,
          settings: {
            autoFinalize: given.autoFinalize ?? stored?.autoFinalize ?? true,
            automaticTax: given.automaticTax ?? stored?.automaticTax ?? false,
            stripeSecretKey: '***',
            taxBehavior:
              given.taxBehavior ?? stored?.taxBehavior ?? 'EXCLUSIVE',
          },
        },
        'ConnectorAppModel.updateStripeSettings result',
      ),
    };
    this.stripeWorld?.onConnected(livemode);

    return clone(this.stripe.settings as ConnectorSettings);
  }

  /** What Stripe says of a key the person typed, from the words in it. */
  private checkStripeCredentials(key: string) {
    const operation = 'UpdateConnectorSettings';
    const marker = (
      Object.keys(REFUSING_KEYS) as Array<keyof typeof REFUSING_KEYS>
    ).find((word) => key.toLowerCase().includes(word));
    if (marker === 'rejected') {
      throw new BillingProblem(
        422,
        `${operation}.CredentialsRejected`,
        'the payment provider refused the credentials: Invalid API Key provided',
        {
          errors: [
            {
              location: 'body.settings.stripeSecretKey',
              message: 'provider error',
              value: {
                providerCode: 'api_key_expired',
                providerRequestId: 'req_mock_1',
              },
            },
          ],
        },
      );
    }
    if (marker === 'offline') {
      throw new BillingProblem(
        503,
        `${operation}.ProviderUnavailable`,
        'the payment provider could not be reached to check the credentials; retry in a moment',
      );
    }
    if (marker === 'elsewhere' && this.stripeWorld?.hasMappedCustomers()) {
      throw new BillingProblem(
        409,
        `${operation}.AccountChanged`,
        "the new key reaches another account than the one this organization's customers live in",
      );
    }
  }

  private refuseWhileRouting(operation: string) {
    const routing = this.stripeWorld?.routing();
    if (
      routing &&
      (routing.activeSubscriptions > 0 || routing.openInvoices > 0)
    ) {
      throw new BillingProblem(
        409,
        `${operation}.BillingActive`,
        'subscriptions or unsettled invoices still route to this payment provider; cancel or switch them, and settle the invoices, first',
        {
          errors: [
            {
              location: 'connector',
              message: 'still routing',
              value: routing,
            },
          ],
        },
      );
    }
  }

  /**
   * `DELETE /connectors/kaiten.integration.billing.stripe/activation`: turns the
   * connector off and keeps its settings, unless a subscription or an unsettled
   * invoice still routes to Stripe.
   */
  deactivateStripe() {
    this.problems.consume('deactivateConnector');
    this.refuseWhileRouting('DeactivateConnector');
    if (this.stripe.activated) {
      this.stripe.activated = false;
      this.stripeWorld?.onDisconnected();
    }
  }

  /** `DELETE /connectors/kaiten.integration.billing.stripe/settings`: forgets the key and turns the connector off. */
  deleteStripeSettings() {
    this.refuseWhileRouting('DeleteConnectorSettings');
    if (!this.stripe.settings) {
      throw new BillingProblem(
        404,
        'DeleteConnectorSettings.NotFound',
        'no settings are stored for this connector',
      );
    }
    const wasActive = this.stripe.activated;
    this.stripe = { activated: false, livemode: false, settings: null };
    if (wasActive) {
      this.stripeWorld?.onDisconnected();
    }
  }

  getSettings(): ConnectorSettings {
    if (!this.settings) {
      throw notFound();
    }
    return clone(this.settings);
  }

  updateSettings(body: ConnectorSettingsWritable): ConnectorSettings {
    const input = parseContract(
      zConnectorSettingsWritable,
      body,
      'ConnectorAppModel.updateSettings body',
    );
    const settings = {
      ...input.settings,
      ...(Object.hasOwn(input.settings, 'attioApiKey')
        ? { attioApiKey: '***' }
        : {}),
    };
    this.settings = parseContract(
      zConnectorSettings,
      {
        connector_name: ATTIO_CONNECTOR_NAME,
        settings,
      },
      'ConnectorAppModel.updateSettings result',
    );
    return clone(this.settings);
  }

  deleteSettings() {
    if (!this.settings) {
      throw notFound();
    }
    this.settings = null;
  }

  getSyncedRecords(): GetAttioSyncedRecordsQuery {
    return clone(this.syncedRecords);
  }
}
