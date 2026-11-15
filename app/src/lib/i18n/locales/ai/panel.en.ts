// AI.Panel (en). Owned by lot L4 (rule panel); spread into en.ts.
export default {
  close: 'Close',
  discard: {
    title: 'Discard your changes?',
    description: 'The rule you were editing has changes that are not saved.',
    keep: 'Keep editing',
    confirm: 'Discard',
  },
  ladder: {
    title: 'How this call is priced',
    label: 'Resolution ladder, most specific first',
    noRule: 'No rule',
    creating: 'Creating this rule',
    levels: {
      EXACT_TYPED: 'Exact model · exact request type',
      EXACT_ALL: 'Exact model · any request type',
      ANY_TYPED: 'Any model · exact request type',
      ANY_ALL: 'Any model · any request type',
    },
    markers: {
      APPLIES: 'Applies',
      SHADOWED: 'Shadowed',
      BLOCKED: 'Ignored',
      EDITING: 'Editing',
      NEW: 'New',
    },
  },
  breakdown: {
    title: 'Reference call',
    dimensions: {
      REQUEST: 'per request',
      INPUT_TOKEN: 'input tokens',
      CACHE_READ_TOKEN: 'cached tokens',
      CACHE_WRITE_TOKEN: 'cache-write tokens',
      OUTPUT_TOKEN: 'output tokens',
      UNIT: 'units',
      SECOND: 'seconds',
    },
    inputRate: '(input rate)',
    noLine: 'No rate applies to this usage',
    computed: 'Computed',
    raised: 'Raised to the minimum',
    capped: 'Capped at the maximum',
    charged: 'Charged',
    credits: '{{amount}} credits',
    vendorCost: 'Vendor cost (catalogue)',
    unknown: 'unknown',
    costPerCredit: 'Cost per credit',
    margin: 'Margin',
    marginAt: 'Margin at {{value}} a credit',
    setValue: 'set a credit value',
    partial:
      'Partial: the catalogue has no cost for part of this usage, so no cost per credit or margin is given.',
  },
  versionArchived:
    'This version is archived. Its rules still price the instances that run on it.',
  notGranted:
    '{{version}} does not grant {{pool}}. A rule here only prices instances that receive the pool another way.',
  throughAddon:
    '{{version}} does not grant {{pool}} itself. A rule here prices the instances that hold it through an add-on.',
  authors: {
    edited: 'Last edited by {{name}} · {{date}}',
    created: 'Created by {{name}} · {{date}}',
    unknown: 'an unnamed user',
  },
  archived: {
    title: '{{model}} is archived.',
    body: 'An archived model authorizes no usage, wildcards included: its calls are refused and charged nothing. Reactivate it in Models to price it.',
    openModels: 'Open models',
  },
  deprecated: {
    keepsRule:
      'This model is deprecated. Its rule can still be edited; it takes no new rule.',
    noNewRule:
      'A deprecated model keeps its existing rules and takes no new one. Reactivate the model to price it here.',
    noOverride:
      'A deprecated model takes no new rule, so it cannot get a price of its own. Reactivate it in Models first.',
  },
  inherited: {
    body_one:
      'Priced by the wildcard {{wildcard}}: {{rates}}. It prices {{count}} model on this version today, and any model added later.',
    body_other:
      'Priced by the wildcard {{wildcard}}: {{rates}}. It prices {{count}} models on this version today, and any model added later.',
    override: 'Override for this model',
    openWildcard: 'Open wildcard',
    help_one:
      'Override adds a rule for {{model}} only. Opening the wildcard changes the price of the {{count}} model it covers, and of models created later.',
    help_other:
      'Override adds a rule for {{model}} only. Opening the wildcard changes the price of all {{count}} models it covers, and of models created later.',
  },
  none: {
    title: 'Not authorized.',
    body: 'No rule prices this call: it is refused and recorded at 0 credits.',
    flaggedTitle: 'This version grants the pool and has no rule.',
    flaggedBody: 'Every call on it is refused and charged nothing.',
    addRule: 'Add a rule for {{model}}',
    addWildcard: 'Add a wildcard instead',
  },
  exact: {
    addTyped: 'Add a rule for {{type}} only',
  },
  wildcard: {
    title: 'Wildcard.',
    editing_one:
      'Changing it reprices {{count}} model on {{version}} that has no rule of its own, and models created later.',
    editing_other:
      'Changing it reprices {{count}} models on {{version}} that have no rule of their own, and models created later.',
    creating:
      'It will price every model without its own rule on {{version}}, models created later included.',
    addOther: 'Add a wildcard on the other level',
    none: 'No wildcard on this version: a model without its own rule is refused.',
  },
  form: {
    level: 'Rule level',
    ratesTitle: 'Credit rates',
    blankHint: 'Blank = unpriced · 0 = free',
    presetsLabel:
      'Rate presets: choose the fields in view, without setting a value',
    presets: {
      PER_REQUEST: 'Per request',
      INPUT_OUTPUT: 'Input + output',
      TOKENS_WITH_CACHE: 'Tokens with cache',
      PER_UNIT: 'Per unit',
      PER_SECOND: 'Per second',
    },
    rates: {
      perRequest: 'Per request',
      perInputToken: 'Per input token',
      perCachedInputToken: 'Per cached input token',
      perCacheWriteToken: 'Per cache-write token',
      perOutputToken: 'Per output token',
      perUnit: 'Per unit',
      perSecond: 'Per second',
    },
    unpriced: 'unpriced',
    inheritsInput: 'inherits input',
    otherRates_one: 'Other rate ({{count}})',
    otherRates_other: 'Other rates ({{count}})',
    limitsTitle: 'Limits and error policy',
    minimum: 'Minimum per request',
    maximum: 'Maximum per request',
    noCap: 'no cap',
    chargeOnError: 'Charge on error',
    policies: {
      NEVER: 'Never',
      PROVIDER_ERROR_ONLY: 'Provider errors only',
      ALWAYS: 'Always',
    },
    startFromWildcard: 'Start from the wildcard’s rates',
    startFromHint: 'Copies its rates and limits into the fields.',
    appliesNext:
      'Applies from the next commit, open reservations included. Past charges are not recomputed.',
    needsRate: 'Type at least one rate.',
    save: 'Save rule',
    add: 'Add rule',
    saved: 'Rule saved',
    created: 'Rule added',
    errors: {
      rate: 'A rate is a number, 0 or more, with at most 10 decimals.',
      bound: 'A limit is a number, 0 or more, with at most 6 decimals.',
      noRate: 'Type at least one rate.',
      maximumBelowMinimum: 'The maximum must be at least the minimum.',
    },
  },
  preview: {
    title: 'Live preview',
    empty:
      'Type a rate to see what these calls would cost. No rate is filled in for you.',
    call: 'Call',
    credits: 'Credits',
    vendor: 'Vendor',
    perCredit: '$ / credit',
    margin: 'Margin',
    model: 'Model',
    covered: 'Covered models on the reference call',
    future: '+ every model created later',
    partial: 'partial',
    calls: {
      SMALL: 'Small',
      REFERENCE: 'Reference',
      LARGE: 'Large',
    },
  },
  archive: {
    action: 'Archive',
    title: 'Archive this rule?',
    confirm: 'Archive rule',
    done: 'Rule archived',
    fallsBack:
      'It stops pricing at once. Calls for {{model}} are then priced by the wildcard {{wildcard}}.',
    fallsBackOwn:
      'It stops pricing at once. Calls for {{model}} are then priced by its rule for any request type.',
    refused:
      'It stops pricing at once. No other rule prices {{model}} on {{version}}: its calls will be refused.',
    wildcard_one:
      'It stops pricing at once. The {{count}} model it prices on {{version}} is refused unless another rule prices it.',
    wildcard_other:
      'It stops pricing at once. The {{count}} models it prices on {{version}} are refused unless another rule prices them.',
  },
} as const;
