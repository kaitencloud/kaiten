// AI.Pool (en). Owned by lot L7 (entitlement pricing tab); spread into en.ts.
export default {
  pricingTab: 'Pricing',
  typeLabel: 'AI credits · Calculated entitlement',
  setPrices: 'Set prices',
  intro:
    'Rules are edited in AI › Pricing, the rate card, where the versions of a family sit side by side. This tab summarises what each version charges.',
  openRateCard: 'Open in rate card',
  openVersionInRateCard: 'Open {{version}} in the rate card',
  tableLabel: 'Pricing of this pool per licence version',
  loading: 'Loading the rate card…',
  columns: {
    version: 'Licence version',
    grant: 'Grant per window',
    rules: 'Rules',
    models: 'Models priced',
    wildcard: 'Wildcard',
    costPerCredit: 'Cost per credit',
    actions: 'Actions',
  },
  grant: {
    notGranted: 'Not granted',
    unlimited: 'Unlimited',
    hardLimit: 'hard limit',
    overage: '+{{percent}} % → {{maximum}}',
  },
  noRule: 'No rule · calls refused',
  noRuleHelp: 'This version grants the pool but no rule prices any model.',
  pricedNotGranted: 'Priced, not granted',
  pricedNotGrantedHelp:
    'Its rules apply only to instances that get the pool from an add-on or a boost.',
  pricedNotGrantedFootnote:
    'Priced, not granted: the rules of these versions apply only to instances that get the pool from an add-on or a boost.',
  wildcardChip: 'Any model · {{type}}',
  anyType: 'any type',
  costRange: '{{cheapest}} – {{dearest}}',
  costModels: '{{cheapest}} → {{dearest}}',
  notAvailable: 'Not available',
  costPartial_one:
    '{{count}} model left out: the catalogue costs part of its reference call only.',
  costPartial_other:
    '{{count}} models left out: the catalogue costs part of their reference call only.',
  footnote:
    'Cost per credit is the vendor cost of each model’s reference call divided by the credits charged for it on that version. Archived versions are dimmed: they still price the instances that run on them.',
  emptyTitle: 'No licence version grants or prices this pool',
  emptyBody:
    'No instance can spend it yet. Grant it on a licence version, then set its prices in the rate card.',
  openLicences: 'Open licences',
  addons: {
    through: 'Through add-on',
    throughNamed: 'Through add-on · {{names}}',
    alsoThrough: '+ add-on',
    details: 'Add-ons that can grant this pool on {{version}}',
    title: 'Add-ons that can grant this pool',
    explain:
      'An add-on version compatible with this licence family can grant {{pool}} to an instance on any of its versions. It does not mean every instance holds it: an add-on is attached to an instance, one by one.',
    loading: 'Reading the add-ons…',
    none: 'No add-on version grants this pool on this family.',
    version: 'v{{version}}',
    default: 'Default version',
    unlimited: 'Unlimited',
    perUnit: '{{amount}} credits per unit',
    maxQuantity: 'up to {{count}} per instance',
    lifecycle: {
      DRAFT: 'Draft',
      PUBLISHED: 'Published',
      ARCHIVED: 'Archived',
    },
    lifecycleHelp: {
      DRAFT: 'Attachable only to an instance with no live subscription.',
      ARCHIVED:
        'No new attachment; the instances that hold it keep it and its grant.',
    },
    behavior: {
      ADD: 'added to what the licence grants',
      OVERRIDE: 'replaces what the licence grants',
      MAX: 'the larger of this and the licence grant applies',
    },
    unreadable: {
      BILLING_OFF:
        'Billing is off on this deployment, so the add-ons cannot be listed here.',
      NO_SCOPE:
        'This session cannot read add-ons (read:addons), so they are not listed here.',
      ERROR: 'The add-ons could not be read.',
    },
  },
  typeHelp: 'The type of entitlement (Boolean, Number, Config or Credits)',
  unitSingular: 'credit',
  unitPlural: 'credits',
} as const;
