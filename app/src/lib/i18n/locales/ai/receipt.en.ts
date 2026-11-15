// AI.Receipt (en). Owned by lot L6 (charge receipt); spread into en.ts.
export default {
  title: 'Charge receipt',
  open: 'Receipt',
  openFor: 'Open the receipt of {{id}}',
  loading: 'Loading the receipt…',
  notFound: 'No inference has the transaction ID {{id}} on this pool.',
  sections: {
    call: 'Call',
    priced: 'How it was priced',
    notCharged: 'Why it was not charged',
    happened: 'What happened',
    pool: 'What it did to the pool',
    cost: 'What it cost you',
    refunds: 'Refunds',
  },
  headline: {
    outcome: '{{type}} · {{outcome}}',
    noCommit: '{{type}} · no commit',
    open: '{{type}} · held',
    notAuthorized: 'Not authorized · {{reason}}',
  },
  call: {
    reportedAt: 'Reported at',
    committedAt: 'Committed at',
    modelSent: 'Model as sent',
    resolvedTo: 'Resolved to',
    matchedBySlug: 'matched by slug',
    matchedByExternalId: 'matched by external ID',
    knownSince:
      'the catalogue knows this name now; it did not when the call was made',
    notInCatalogue: 'No model has this slug or external ID',
    catalogueUnread: 'not named: this session may not read the model catalogue',
    pool: 'Pool',
    licence: 'Licence version',
    licenceCurrent:
      'current version; this older row does not store the version at commit',
    licenceDeleted: 'this licence version no longer exists',
    usage: 'Usage',
  },
  priced: {
    rule: 'Rule',
    specificity: {
      EXACT_TYPED: 'Exact model · exact request type',
      EXACT_ALL: 'Exact model · any request type',
      ANY_TYPED: 'Any model · exact request type',
      ANY_ALL: 'Any model · any request type',
    },
    snapshot: 'Rates as applied at commit, read from the inference row.',
    snapshotUnchanged:
      'Rates as applied at commit, read from the inference row. The rule has not changed since.',
    snapshotSameToday:
      'Rates as applied at commit, read from the inference row. The rule was written again since; its rates, bounds and error policy today are the same as those applied.',
    snapshotRuleUnread:
      'Rates as applied at commit, read from the inference row. This session may not read licences, so the rule as it is now was not read: nothing here says whether it has changed since.',
    archivedSince: 'Rule archived since',
    archivedSinceHelp:
      'The rule was archived after this commit and prices nothing today. The rates below are those applied.',
    editedSince: 'Rule edited since',
    editedSinceHelp:
      'The rule has changed since this commit. The rates below are those applied; the current value is beside each one that changed.',
    now: 'now {{value}}',
    nowBlank: 'now not priced',
    nowNoMaximum: 'now no maximum',
    nowMinimum: 'minimum now {{value}}',
    nowMaximum: 'maximum now {{value}}',
    snapshotDisagrees:
      'Recomputing these rates does not give back the stored amounts. The stored amounts are what the pool was charged.',
    matches:
      'Recomputed from the rule as it is now; it matches the stored amount. This older row does not store the rates applied at commit.',
    inputFallback: 'input rate',
    rates: {
      perRequest: 'Per request',
      perInputToken: 'Per input token',
      perCachedInputToken: 'Per cached input token',
      perCacheWriteToken: 'Per cache-write token',
      perOutputToken: 'Per output token',
      perUnit: 'Per unit',
      perSecond: 'Per second',
    },
    lines: {
      REQUEST: 'per request',
      INPUT_TOKEN: '{{quantity}} input × {{rate}}',
      CACHE_READ_TOKEN: '{{quantity}} cache read × {{rate}}',
      CACHE_WRITE_TOKEN: '{{quantity}} cache write × {{rate}}',
      OUTPUT_TOKEN: '{{quantity}} output × {{rate}}',
      UNIT: '{{quantity}} units × {{rate}}',
      SECOND: '{{quantity}} s × {{rate}}',
    },
    computed: 'Computed',
    charged: 'Charged',
    chargedValue: '{{amount}} credits',
    bounds: 'Minimum {{minimum}} · maximum {{maximum}}',
    noMaximum: 'none',
    within: 'within',
    raisedTo: 'raised to {{amount}}',
    loweredTo: 'lowered to {{amount}}',
    missingInput: 'No priced quantity was reported: the minimum applies.',
    policy: 'Charge on error: {{policy}}',
    policies: {
      NEVER: 'Never',
      ALWAYS: 'Always',
      PROVIDER_ERROR_ONLY: 'Provider errors only',
    },
    chargedOutcome: 'charged',
    notChargedOutcome: 'not charged',
    reserved: 'Reserved',
    ruleId: 'Rule ID',
    noRule: 'none',
    cannot: {
      intro:
        'This older row does not store the rates applied at commit, so this amount is not re-derived here. The stored amounts are the facts.',
      reasons: {
        RULE_EDITED_AFTER_COMMIT:
          'The rule was edited on {{date}}, after this commit: its current rates may not be those applied.',
        RULE_NOT_FOUND:
          'Rule {{id}} is not found on licence version {{version}}.',
        RULE_NOT_READ:
          'This session may not read licences, so rule {{id}} was not read.',
        RULE_NOT_ON_CURRENT_VERSION:
          'Rule {{id}} belongs to licence version {{ruleVersion}}, not to the current version {{version}}.',
        AMOUNT_MISMATCH:
          'Recomputing with the rule as it is now gives other amounts than those stored.',
        NOT_COMMITTED: 'Nothing was computed: the call was not committed.',
        NOT_AUTHORIZED: 'No rule priced this call.',
        NOT_RECOMPUTABLE:
          'The row lacks what a recomputation needs: a request status or stored amounts.',
      },
    },
  },
  denial: {
    NO_RULE:
      'No active rule on {{version}} for the {{pool}} pool prices {{model}} for {{type}}, and no wildcard covers it.',
    UNKNOWN_MODEL:
      '{{model}} is neither a model slug nor an external ID in the catalogue, so no rule could be looked up.',
    MODEL_ARCHIVED:
      '{{model}} is archived. An archived model is never priced, not even by a wildcard.',
    generic: 'The call was not authorized.',
    knownSince:
      '{{model}} has been added to {{name}} since. Calls sent under this name now resolve to it and are priced by its rules; this one stays as recorded.',
    recorded: 'The call was recorded at 0 credits.',
    fix: {
      NO_RULE:
        'Price this model on the rate card, or add a wildcard for the request type.',
      UNKNOWN_MODEL:
        'Add {{model}} to a model as an external ID, or create the model, then price it.',
      MODEL_ARCHIVED:
        'Point the integration at an active model, or restore this one in Models.',
    },
  },
  happened: {
    expired:
      'A reservation of {{amount}} credits was taken at {{reportedAt}} and no commit arrived before it expired at {{expiresAt}}. The hold was released in full and nothing was charged. If the provider call did run, its usage was not reported.',
    released:
      'The call was released without being sent to the provider. The hold was given back and nothing was charged.',
    noReservation:
      'A release was reported for this transaction ID, which held no reservation. Nothing was held and nothing was charged; the ID is closed so that a late reservation cannot hold credits under it.',
    open: 'A reservation of {{amount}} credits is held until {{expiresAt}}. The charge is computed when the integration commits the call.',
  },
  pool: {
    reserved: 'Reserved before the call',
    givenBack: {
      COMMITTED: 'Given back at commit',
      EXPIRED: 'Given back at expiry',
      RELEASED: 'Given back at release',
    },
    drawnAbove: 'Drawn above the reservation',
    counterBefore: 'Counter before',
    counterAfter: 'Counter after',
    counterOf: '{{value}} / {{maximum}}',
    reservation: 'Reservation',
    nothingHeld: 'refused, nothing held',
    counter: 'Counter',
    unchanged: 'unchanged',
    held: 'Held until',
    refunded: 'Given back by refunds since',
    reportSeq: 'Usage journal sequence',
  },
  refunds: {
    summary: 'Refunded {{refunded}} of {{charged}} credits.',
    left: '{{amount}} credits are left to refund.',
    nothingLeft: 'This charge is refunded in full.',
    amount: '{{amount}} credits',
    noReason: 'no reason given',
    by: 'by {{name}}',
    unknownUser: 'an unnamed user',
    sequence: 'journal sequence {{sequence}}',
  },
  refund: {
    action: 'Refund {{amount}} credits…',
    title: 'Refund credits',
    description: 'Charge of {{charged}} credits on transaction {{id}}.',
    amount: 'Credits to refund',
    amountHelp: 'Up to {{left}} credits are left to refund on this charge.',
    amountInvalid:
      'Enter a positive number of credits, with at most six decimals.',
    amountExceeds: 'This is more than what is left to refund.',
    reason: 'Reason',
    reasonHelp:
      'Optional. Kept with the refund and shown to anyone who can read this instance.',
    reasonTooLong: 'The reason is at most 500 characters long.',
    fixAmount: 'Correct the amount to refund',
    explain:
      'The credits go back to the {{pool}} pool in the window open now. The charge stays on record, with this refund beside it. A refund cannot be undone here.',
    confirm: 'Refund',
    success: 'Refunded {{amount}} credits.',
    exceedsLeft:
      'The refund exceeds what is left on this charge: {{left}} credits.',
    frozenHelp: 'Locked: this refund was sent and has no answer yet.',
    unanswered:
      'No answer came back, so this refund may or may not have gone through. Its amount and reason are locked: sending it again cannot refund twice. If it keeps failing, reload the page and read the refunds of this charge before refunding again.',
    resend: 'Send the same refund again',
    earlier:
      'An earlier refund of this charge probably went through without its answer reaching this page. The receipt was read again: {{left}} credits are left to refund. Check the refunds listed on the receipt before refunding again.',
    earlierNothingLeft:
      'An earlier refund of this charge probably went through: nothing is left to refund. Check the refunds listed on the receipt.',
    earlierUnread:
      'An earlier refund of this charge probably went through, and the receipt could not be read again. Read it again before refunding: what is left may have changed.',
    readAgain: 'Read the receipt again',
  },
  externalId: {
    action: 'Add as external ID of…',
    title: 'Add as an external ID',
    description:
      'The integration sent {{model}}, which the catalogue does not know.',
    model: 'Catalogue model',
    choose: 'Choose a model',
    search: 'Search models',
    empty: 'No model matches.',
    suggested: 'Suggested: its name starts with the slug of {{name}}.',
    explain:
      '{{model}} becomes an external ID of the model you choose. Future calls sent under this name resolve to that model and are priced by its rules. Past inferences are not re-priced.',
    confirm: 'Add external ID',
    success: '{{model}} is now an external ID of {{name}}.',
    createInstead: 'Create a model instead',
  },
  cost: {
    vendorComputed: 'Vendor cost (catalogue today × usage)',
    vendorStored: 'Vendor cost (computed at commit from the catalogue)',
    vendorReported: 'Vendor cost (reported by the integration)',
    notStored: 'not stored',
    notReported: 'not reported',
    drift: 'Difference (reported − computed)',
    driftAbove: 'the integration reports more than the catalogue computes',
    driftBelow: 'the integration reports less than the catalogue computes',
    costPerCreditNote: 'from the computed cost',
    partial: 'partial: no catalogue cost for part of the usage',
    unknown: 'no cost in the catalogue',
    costPerCredit: 'Cost per credit',
    margin: 'Margin at {{value}} a credit',
    marginNote: 'The credit value is saved in this browser, not on the pool.',
    noMargin:
      'Set a credit value for this pool on the rate card to see a margin.',
    notCharged: 'not charged',
    marginAfterRefunds: 'On what the charge kept after its refunds.',
    refundedInFull: 'refunded in full',
  },
  actions: {
    openRule: 'Open rule',
    priceIt: 'Price it',
    openModel: 'Open model',
    openModels: 'Open models',
  },
  raw: {
    show: 'Raw record',
    description: 'The row as the API returns it, for support.',
  },
  warnings: {
    title: 'Warnings',
    help: {
      NO_RESERVATION:
        'The transaction held no reservation when this was reported.',
      COUNTER_PRECISION_DEGRADED:
        'The pool’s counter is too large to hold this charge exactly. The charge on this receipt is exact; the counter is rounded.',
      PRICING_SNAPSHOT_UNREADABLE:
        'The rates stored with this commit could not be read, so they are not shown. The stored amounts are what was charged.',
      MODEL_DEPRECATED:
        'The model is deprecated. It is still priced; point the integration at its replacement.',
      CONVERSION_INPUT_MISSING:
        'The call reported no quantity the rule prices, so the rule’s minimum was computed.',
      OVERDRAWN:
        'The call was counted although it took the pool past its maximum.',
    },
    NO_RESERVATION: 'No reservation',
    PRICING_SNAPSHOT_UNREADABLE: 'Stored rates unreadable',
    COUNTER_PRECISION_DEGRADED: 'Counter precision degraded',
    MODEL_DEPRECATED: 'Deprecated model',
    ESTIMATE_INCOMPLETE: 'Estimate incomplete',
    RESERVATION_EXPIRED: 'Reservation expired',
    MODEL_NOT_AUTHORIZED: 'Model not authorized',
    UNKNOWN_MODEL: 'Unknown model',
    CONVERSION_INPUT_MISSING: 'No priced quantity reported',
    OVERDRAWN: 'Overdrawn',
  },
} as const;
