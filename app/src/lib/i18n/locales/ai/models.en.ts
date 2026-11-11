// AI.Models (en). Owned by lot L9 (models); spread into en.ts.
export default {
  identity: 'Identity',
  provider: 'Provider details',
  slugHelp: 'Use lowercase letters, numbers and hyphens.',
  slugLocked: 'The identifier cannot change after creation.',
  modalityLocked: 'The modality cannot change after creation.',
  description:
    'Models your licenses can authorize through credit conversion rules.',
  search: 'Search models',
  searchPlaceholder: 'Name, identifier, provider, modality or status',
  count: '{{count}} of {{total}} models',
  empty: 'No models yet. Create a model to configure credit pricing.',
  noMatches:
    'No models match this search. Try another name, provider or status.',
  loading: 'Loading model catalogue…',
  vendorCost: 'Vendor cost',
  rules: 'Rules',
  allStatuses: 'All statuses',
  cost: {
    tokens: '${{input}} in · ${{output}} out / 1M tokens',
    inputOnly: '${{input}} / 1M input tokens',
    outputOnly: '${{output}} / 1M output tokens',
    unit: '${{unit}} / unit',
    none: 'Not set',
  },
  rulesCount_zero: 'No rule',
  rulesCount_one: '{{count}} rule',
  rulesCount_other: '{{count}} rules',
  rulesLink_zero: 'Open the rate card on {{model}}: no rule names it',
  rulesLink_one: 'Open the rate card on {{model}}: {{count}} rule names it',
  rulesLink_other: 'Open the rate card on {{model}}: {{count}} rules name it',
  deleteModel: 'Delete {{model}}',
  removal: {
    inUseTitle: '{{model}} cannot be deleted',
    inUse_one:
      '{{count}} rule names this model. A model a rule references cannot be deleted.',
    inUse_other:
      '{{count}} rules name this model. A model a rule references cannot be deleted.',
    refused:
      'The API refused the deletion: a conversion rule references this model, which may be an archived rule the rate card does not list.',
    archiveInstead:
      'Archive it instead: an archived model authorizes no usage, wildcards included, so every call sent for it is refused. Its rules stay where they are, and its status can be set back in its form.',
    alreadyArchived:
      'It is already archived: it authorizes no usage. It can be deleted once no rule references it.',
    archive: 'Archive model',
    openRules: 'Open its rules',
    archived: '{{model}} is archived.',
    deleted: '{{model}} is deleted.',
  },
  title: 'Models',
  create: 'Create model',
  edit: 'Edit model',
  externalIds: 'Provider identifiers (one per line)',
  modelImpact:
    'Model status is shared across entitlements. Changes also affect pending commits; reservations do not lock model eligibility or pricing.',
  lifecycle:
    'Active accepts new rules. Deprecated keeps existing rules but rejects new ones. Archived authorizes no usage, including through wildcards. Status changes are reversible.',
  openRouterUnreachable:
    'OpenRouter’s catalogue could not be reached from this browser.',
  openRouterUnreachableHelp:
    'The import reads the catalogue straight from openrouter.ai in your browser. It needs outbound access to openrouter.ai: a Content Security Policy, no network or an air-gapped install blocks it. Create the model manually instead.',
  wildcardRow: '{{version}} ({{slug}}) · {{pool}} · {{requestType}}',
  wildcardNone: 'No “any model” rule prices a model of this modality today.',
} as const;
