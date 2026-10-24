export default {
  Common: {
    stepOf: 'Step {{current}} of {{total}}',
    requiredFieldsHint: 'Fill in the required fields',
    edit: 'Edit',
    delete: 'Delete',
    actions: 'Actions',
    moveUp: 'Move up',
    moveDown: 'Move down',
    reorder: 'Reorder',
    systemActor: 'Kaiten (system)',
    cancel: 'Cancel',
    confirm: 'Confirm',
    undo: 'Undo',
    continue: 'Continue',
    search: 'Search',
    close: 'Close',
    increaseValue: 'Increase value',
    decreaseValue: 'Decrease value',
    toggleSection: 'Toggle section',
    save: 'Save',
    apply: 'Apply',
    format: 'Format',
    create: 'Create',
    new: 'New',
    update: 'Update',
    loading: 'Loading...',
    noResults: 'No results',
    none: 'None',
    useValue: 'Use "{{value}}"',
    retry: 'Retry',
    reset: 'Reset',
    table: 'Table',
    list: 'List',
    filter: 'Filter',
    filterBy: 'Filter by:',
    addFilter: 'Add filter',
    clearFilter: 'Clear filter',
    removeFilterForField: 'Remove {{field}} filter',
    advancedFilter: 'Advanced filter',
    where: 'Where',
    addRule: 'Add rule',
    deleteRule: 'Delete rule',
    clearRules: 'Clear rules',
    and: 'and',
    pickDate: 'Pick a date',
    clear: 'Clear',
    datePicker: {
      dateDialog: 'Choose a date',
      timeUtc: 'Time (UTC)',
      timeUtcWithLocal: 'Time (UTC), your local time is shown below',
      localEquivalent: '= {{time}} in {{place}} ({{zone}})',
      localEquivalentNoPlace: '= {{time}} ({{zone}})',
      timeInvalid: 'Enter a complete time, for example 09:30.',
      timeOutOfRange: 'Enter a time from 00:00 to 23:59.',
      dayMissing: 'Choose a day as well as the time.',
      hours: 'Hours',
      minutes: 'Minutes',
      timeEmpty: 'Empty',
      chooseTime: 'Choose a time',
      previousHour: 'Previous hour',
      nextHour: 'Next hour',
      previousMinute: 'Previous minute',
      nextMinute: 'Next minute',
    },
    all: 'All',
    trueValue: 'True',
    falseValue: 'False',
    filterFieldPlaceholder: 'Filter {{field}}...',
    selectedCount: '{{count}} selected',
    rulesCount_one: '{{count}} rule',
    rulesCount_other: '{{count}} rules',
    noFilterAvailable: 'No filter available',
    or: 'or',
    confirmDeleteTitle: 'Are you sure?',
    confirmDeleteDescription:
      'This action cannot be undone. This will delete {{name}}',
    discardFormChangesTitle: 'Discard your changes?',
    discardFormChangesDescription:
      'If you close now, any unsaved information will be lost.',
    discardFormChangesConfirm: 'Discard',
    deleteSuccess: 'Item deleted successfully',
    deleteError: 'Failed to delete item',
    moreInformation: 'More information',
    charts: {
      emptyState: 'No data available',
    },
    tableSortAriaAsc: 'Sorted ascending: {{column}}',
    tableSortAriaDesc: 'Sorted descending: {{column}}',
    tableSortAriaNone: 'Not sorted, click to sort: {{column}}',
    tableShowingRecords: 'Showing {{start}}-{{end}} of {{total}} records',
    rowsPerPage: 'Rows per page',
    firstPage: 'First page',
    previous: 'Previous',
    next: 'Next',
    nextBlocked: 'Fill in the required fields correctly to continue.',
    lastPage: 'Last page',
  },
  Functionals: {
    CelEditor: {
      checking: 'Checking…',
      noIssues: 'No issues',
      issueCount_one: '{{count}} issue',
      issueCount_other: '{{count}} issues',
      issueLine: 'Line {{line}}',
      context: 'Context',
      contextTitle: 'What a rule can read',
      contextOpenWorld:
        'Not a closed list: attributes your own evaluation contexts carry can be targeted too.',
      contextMayBeAbsent: 'may be absent',
      contextCurrentKeys: 'Current keys:',
      templates: 'Templates',
      templateProductionZone: 'Production zone',
      templateHealthyInstance: 'Healthy instance',
      templateEntitlementGranted: 'Feature granted by the license',
      templateEntitlementNearLimit: 'Entitlement near its limit',
      templateEntitlementExhausted: 'Entitlement exhausted',
      templateHostAttribute: 'One of your own attributes',
      editRule: 'Edit the rule',
      writeRule: 'Write the rule…',
      dialogTitle: 'CEL rule',
      dialogDescription:
        'Completion and documentation follow your context; problems are checked as you type. Nothing is saved until you apply.',
    },
    FormRecovery: {
      offer: {
        title: 'Pick up where you left off?',
        description: 'Unsent entries for this form were kept ({{when}}).',
        descriptionAtStep:
          'Unsent entries for this form were kept ({{when}}), at step {{current}} of {{total}} ({{step}}).',
        omitted_one:
          'For security, one field is never kept and must be entered again: {{fields}}.',
        omitted_other:
          'For security, some fields are never kept and must be entered again: {{fields}}.',
        formChanged:
          'The form has changed since: check each step before sending.',
        others_one: '{{count}} other unsent entry is kept.',
        others_other: '{{count}} other unsent entries are kept.',
        showOther_one: 'Show the other entry',
        showOther_other: 'Show the next entry',
        discardOne: 'Discard this one',
      },
      time: { justNow: 'just now' },
      resume: 'Resume',
      startOver: 'Start over',
      uncertain: {
        title: 'Your last submission may have gone through',
        description:
          'A submission started on {{date}} at {{time}} and the page got no answer. Check the list before sending again, so as not to create a duplicate.',
        resumeAnyway: 'Resume anyway',
        discard: 'Discard these entries',
      },
      condensed: {
        description: 'Earlier entries ({{when}}) are still kept.',
        restore: 'Bring them back',
        hide: 'Hide',
      },
      openElsewhere: {
        description:
          'This form is also open in another tab, with entries in progress. This tab keeps its own.',
      },
      notKept: {
        otherTab:
          'These entries are also open in another tab, which keeps them. What you enter here is no longer kept on this device.',
        discarded:
          'These entries were discarded from another tab. What you enter here is no longer kept on this device.',
        unknown: 'These entries are no longer kept on this device.',
        keepHere: 'Keep them here',
      },
      sentElsewhere: {
        description:
          'These entries were sent from another tab: sending them here would create a duplicate.',
      },
      unknownOutcome: {
        description:
          'The last submission got no answer and may have gone through. Check the list before trying again.',
      },
      followUp: {
        pending:
          'Created, but the next step did not go through. If you leave this page, your corrections will not be kept here.',
        later: 'Sending “{{name}}” did not finish.',
      },
      lost: {
        description:
          'Your entries from {{date}} could not be restored: the form has changed since.',
      },
      notes: {
        title: 'Entries restored',
        intro: 'Some values no longer apply and were removed:',
        unavailable: '“{{name}}” ({{kind}}) is no longer available.',
        unavailableUnnamed:
          'A selected item is no longer available ({{kind}}).',
        reset: '{{field}} was reset: the form changed since.',
        itemRemoved:
          'An item of {{field}} was removed: the form changed since.',
        sourceFallback: 'The source of these values',
        sourceChanged:
          '{{source}} has changed since: its values were loaded again.',
      },
      omitted: {
        reminder_one:
          'For security, this field is never kept: {{fields}}. Enter it again.',
        reminder_other:
          'For security, these fields are never kept: {{fields}}. Enter them again.',
        continueWithout_one: 'Continue without it',
        continueWithout_other: 'Continue without them',
      },
      announce: {
        resumed: 'Entries restored.',
        resumedAtStep:
          'Entries restored, step {{current}} of {{total}} ({{step}}).',
        unknownOutcome:
          'Warning: the last submission may have gone through. Check the list before sending again.',
        sentElsewhere:
          'Warning: these entries were sent from another tab. Sending them again would create a duplicate.',
      },
      dismiss: 'OK',
      toast: {
        discarded: 'Previous entries discarded',
        undo: 'Undo',
        cancelled: 'Entries discarded',
        replaced: 'Current entries replaced',
      },
    },
  },
  Errors: {
    title: 'Something went wrong',
    description: 'An error occurred while loading this page.',
    errorTitle: 'Error',
    unknownError: 'An unknown error occurred',
    goHome: 'Go Home',
    retry: 'Try Again',
    notFound: 'Page not found',
    notFoundDescription: "The page you're looking for doesn't exist.",
    backTo: 'Back to {{section}}',
    restricted: 'Restricted access',
    restrictedDescription: "You don't have access to this page.",
    restrictedAction: "You don't have access to this action.",
    restrictedScope: 'Missing required scope: {{scope}}',
    api: {
      UNKNOWN: 'An unexpected error occurred.',
      NETWORK: 'Unable to connect to the server. Please check your connection.',
      UNAUTHORIZED: 'You are not signed in. Please sign in and try again.',
      FORBIDDEN: "You don't have permission to perform this action.",
      NOT_FOUND: 'The requested resource was not found.',
      VALIDATION:
        'Some of the submitted data is invalid. Please review and try again.',
      CONFLICT:
        'This action conflicts with the current state. Please refresh and try again.',
      RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
      SERVER_ERROR: 'The server encountered an error. Please try again later.',
      GRAPHQL_ERROR: 'The request could not be completed. Please try again.',
    },
  },
  Sign: {
    email: 'Email Adress',
    password: 'Password',
    continue: 'Continue',
    resend: "Didn't recieve a code? Resend",
    In: {
      title: 'Sign in',
      subTitle: 'Welcome back! Please sign in to continue',
      signUpLink: "Don't have an account? Sign up",
      forgotPassword: 'Forgot password?',
      signUp: 'Sign up',
      welcomeBack: 'Welcome back',
      goBack: 'Go back',
      ChooseStrategy: {
        title: 'Use another method',
        description:
          'Facing issues? You can use any of these methods to sign in.',
        emailCode: 'Email Code',
      },
      Verifications: {
        title: 'Check your email',
        subTitle: 'Enter the verification code sent to your email',
        anotherMethod: 'Use another method',
        Password: {
          title: 'Enter your password',
        },
        EmailCode: {
          title: 'Check your email',
          subTitle: 'Enter the verification code sent to your email',
          emailVerification: 'Email verification code',
        },
      },
      ForgotPassword: {
        title: 'Forgot your password?',
        resetPassword: 'Reset password',
      },
      ResetPassword: {
        title: 'Reset password',
        subTitle: 'Enter your new password',
        confirmPassword: 'Confirm password',
        confirm: 'Confirm',
      },
    },
    Up: {
      title: 'Sign up',
      subTitle: 'Welcome! Please fill in the details to get started.',
      signInLink: 'Already have an account? Sign in',
      Continue: {
        title: 'Continue registration',
        username: 'Username',
      },
      Verifications: {
        title: 'Verify your email',
        subTitle: 'Use the verification link sent to your email address',
      },
    },
  },
  Pages: {
    Dashboard: {
      title: 'Dashboard',
      subtitle:
        'Operational health across customers, licenses, releases, and automation',
      loading: 'Loading...',
      errorLoadingData: 'Error loading dashboard data',
      refreshingInsights: 'Refreshing supplemental insights...',
      customers: 'Customers',
      instances: 'Instances',
      licenses: 'Licenses',
      expiringIn60Days: 'Expiring in 60 days',
      stats: {
        customers: 'Customers',
        activeInstances: 'Active Instances',
        expiringIn60Days: 'Expiring in 60 days',
        expiringIn60DaysHelper: '{{count}} within 60 days',
        expiringIn30Days: 'Expiring in 30 days',
        licenses: 'Licenses',
        featureFlagsEnabled: 'Feature Flags Enabled',
        tokensExpiringSoon: 'Tokens Expiring Soon',
        totalTokens_one: '{{count}} total token',
        totalTokens_other: '{{count}} total tokens',
        activeTokens_one: '{{count}} active token',
        activeTokens_other: '{{count}} active tokens',
      },
      insights: {
        entitlementAlerts: {
          title: 'Entitlements Near Threshold',
          description_one: '{{count}} entitlement is over limit',
          description_other: '{{count}} entitlements are over limit',
          currentPeriod_one:
            '{{count}} of these resets with its current usage window',
          currentPeriod_other:
            '{{count}} of these reset with their current usage window',
        },
        releaseCoverage: {
          title: 'Release Coverage',
          description: 'Zones currently mapped to a release version.',
        },
        automationSurface: {
          title: 'Automation Surface',
          description_one: '{{count}} token across service accounts',
          description_other: '{{count}} tokens across service accounts',
        },
      },
      chartLabels: {
        instances: 'Instances',
        created: 'Created',
        started: 'Started',
        ending: 'Ending',
        enabled: 'Enabled',
        disabled: 'Disabled',
        flags: 'Flags',
        releases: 'Releases',
        zones: 'Zones',
        healthy: 'Healthy',
        expiringSoon: 'Expiring Soon',
        expired: 'Expired',
        revoked: 'Revoked',
        noExpiry: 'No Expiry',
        tokens: 'Tokens',
      },
      charts: {
        emptyState: 'No data available for this chart.',
        licenseExpirationForecast: {
          title: 'License Expiration Forecast',
          description: 'Projected expiration windows for active instances',
          buckets: {
            zeroToSevenDays: '0-7d',
            eightToThirtyDays: '8-30d',
            thirtyOneToSixtyDays: '31-60d',
            sixtyOneToNinetyDays: '61-90d',
            overNinetyDays: '90+d',
          },
        },
        topCustomersByInstances: {
          title: 'Top Customers by Active Instances',
          description: 'Largest customer footprints',
        },
        tokenSecurityPosture: {
          title: 'Token Security Posture',
          description: 'Current distribution of token lifecycle states',
          emptyState: 'No service account tokens available',
          singleState_one: 'The only token is {{state}}',
          singleState_other: 'All {{count}} tokens are {{state}}',
        },
        instanceLifecycleTimeline: {
          title: 'Instance Lifecycle Timeline',
          description: 'Monthly created, started, and ending license events',
        },
        releaseCadence: {
          title: 'Release Cadence',
          description: 'Releases created per month',
          emptyState: 'No releases available',
        },
        releaseCoverageByZone: {
          title: 'Release Coverage by Zone',
          description: 'Deployment zones mapped to release versions',
          emptyState: 'No deployment zones available',
          unassigned: 'Unassigned',
          allUnassigned_one: 'The only zone does not run a release yet',
          allUnassigned_other: 'None of the {{count}} zones runs a release yet',
        },
        flagTargetingComplexity: {
          title: 'Flag Targeting Complexity',
          description: 'How many rules are configured per flag',
        },
        featureFlagsGovernance: {
          title: 'Feature Flags Governance',
          description: 'Enablement split and type distribution',
          emptyState: 'No feature flags available',
          allEnabled_one: 'The only flag is enabled',
          allEnabled_other: 'All {{count}} flags are enabled',
          allDisabled_one: 'The only flag is disabled',
          allDisabled_other: 'All {{count}} flags are disabled',
        },
        entitlementSaturationHeatmap: {
          title: 'Entitlement Saturation Heatmap',
          description:
            'Usage load by license type and threshold band, split by counter scope',
          emptyState: 'No entitlement usage data available',
          licenseTypeAndScope: 'License type & scope',
          scopes: {
            LIFETIME: 'Lifetime total',
            PERIODIC: 'Current window',
          },
          bands: {
            under50: '<50%',
            between50And80: '50-80%',
            between80And100: '80-100%',
            over100: '>100%',
            unbounded: 'No limit',
          },
        },
      },
    },
    Customers: {
      title: 'Customers',
      subtitle: 'End clients and their instances',
      Tabs: {
        customers: 'Customers',
        instances: 'Instances',
        checkoutSessions: 'Checkouts',
        hosts: 'Hosts',
      },
      CheckoutSessions: {
        title: 'Checkouts',
        subtitle:
          'Anonymous checkouts started from your publishable keys, and the customers they created',
        loading: 'Loading the checkouts',
        noRecord: 'Not created',
        expiredRemains: 'Stays after expiry',
        expiredNote:
          'This checkout expired after its customer and instance were created. Both remain: the instance is on the fallback version of the license, with a canceled subscription, for you to delete.',
        Status: {
          OPEN: 'Open',
          AWAITING_PAYMENT: 'Awaiting payment',
          COMPLETED: 'Completed',
          ABANDONED: 'Abandoned',
          EXPIRED: 'Expired',
        },
        Columns: {
          status: 'Status',
          email: 'Email',
          license: 'License',
          dueToday: 'Due today',
          key: 'Publishable key',
          customer: 'Customer',
          instance: 'Instance',
          created: 'Created',
          expires: 'Expires',
        },
        Filters: {
          search: 'Search',
          searchPlaceholder:
            'Search by email, reference, license, customer or key…',
          status: 'Status',
          period: 'Period',
          email: 'Email',
          emailPlaceholder: 'Email address',
          clientReference: 'Client reference',
          clientReferencePlaceholder: 'Your reference',
          clear: 'Clear filters',
        },
        Empty: {
          title: 'No checkout yet',
          description:
            'A checkout appears here when a visitor starts one from a page that sends a publishable key allowed to open the anonymous checkout.',
          filteredTitle: 'No checkout matches',
          filteredDescription: 'Change or clear the filters to see more.',
        },
        Drawer: {
          title: 'Checkout',
          loading: 'Loading the checkout',
          gone: 'This checkout no longer exists: the API deletes a checkout 90 days after it closed.',
          email: 'Email',
          clientReference: 'Client reference',
          license: 'License',
          period: 'Period',
          price: 'Price',
          addOns: 'Add-ons',
          addOn: '{{slug}} × {{quantity}}',
          key: 'Publishable key',
          trial: 'Trial',
          trialEnds: 'Ends {{date}}',
          noTrial: 'No trial',
          trialAlreadyConsumed:
            'This email already had the trial of this plan, so the checkout bills the first period.',
          customer: 'Customer created',
          instance: 'Instance created',
          created: 'Created',
          expires: 'Expires',
          completed: 'Completed',
          closed: 'Closed',
          dueToday: 'Due today',
          DueToday: {
            noLines: 'Nothing is due today.',
            subtotal: 'Subtotal',
            discount: 'Discount',
            total: 'Total',
          },
        },
      },
      Table: {
        Columns: {
          name: 'Name',
          externalId: 'External ID',
          domain: 'Domain',
          crmSync: 'CRM Sync',
          instances: 'Instances',
          customerName: 'Customer Name',
          licenseType: 'License Type',
          features: 'Features',
          host: 'Host',
          plan: 'Plan',
        },
        warningDelete:
          'Some instances are still associated with this Customer.\nYou need to update their customer first to ensure no instance remains linked to the current customer',
        instanceCount_one: '{{count}} instance',
        instanceCount_other: '{{count}} instances',
        Dialogs: {
          instancesTitle: 'Instances for this customer',
          instancesDescription: 'Active deployments linked to this customer.',
          Columns: {
            instance: 'Instance',
            licenseType: 'License type',
          },
        },
      },
      Detail: {
        editName: 'Edit name',
        customerDetails: {
          title: 'Customer details',
          description: 'Name, CRM link, audit dates.',
          fields: {
            name: 'Name',
            externalId: 'External ID',
            domain: 'Domain',
            billingEmail: 'Billing e-mail',
            createdAt: 'Created at',
            updatedAt: 'Updated at',
          },
          by: 'by',
          billingEmailNone: 'Not set',
        },
        paymentMethod: {
          title: 'Payment method',
          description:
            'The card Stripe charges for the contracts of this customer that collect automatically. Kaiten keeps its brand, its last four digits and its expiry, and never the number.',
          loading: 'Loading the payment method',
          add: 'Add a payment method',
          replace: 'Replace',
          portal: 'Manage in Stripe',
          remove: 'Remove',
          openInStripe: 'Open the customer in Stripe',
          setupFailed:
            'The payment method was not saved. If the customer has finished on the page of Stripe, check again; otherwise start over with the button above.',
          checkAgain: 'Check again',
          None: {
            title: 'No payment method on file',
            description:
              'Without one, no contract of this customer can be charged automatically. A contract that sends the invoice needs none.',
          },
          Card: {
            brandAndLast4: '{{brand}} ending in {{last4}}',
            last4Only: 'Card ending in {{last4}}',
            expires: 'Expires {{month}}/{{year}}',
          },
          Status: {
            active: 'Active',
            expiresSoon: 'Expires soon',
            expired: 'Expired',
            failed: 'Last charge failed',
          },
          Unusable: {
            expired:
              'This card has expired. Stripe cannot charge it: save another one.',
            failed:
              'A charge said this card can no longer be used. Save another one.',
          },
          Currency: {
            title: 'Currency of the payment method',
            description:
              'This customer has no live subscription to take a currency from: say the currency the payment method is set up in.',
            label: 'Currency',
            hint: 'The payment method is set up in this currency, and is charged for the contracts billed in it.',
            placeholder: 'Pick a currency',
            search: 'Search a currency',
            confirm: 'Continue to Stripe',
            Errors: {
              currency: 'Pick one of the currencies in the list',
            },
          },
          Remove: {
            title: 'Remove the payment method?',
            description:
              'Stripe will no longer be able to charge this customer. A contract that sends the invoice is not affected.',
            confirm: 'Remove',
            inUse:
              'Switch the contracts of this customer that are charged automatically to sending the invoice, in the Billing tab of their instance, then remove the payment method.',
          },
          Toasts: {
            saved: 'Payment method saved',
            removed: 'Payment method removed',
          },
        },
        Billing: {
          Invoices: {
            description:
              'The invoices of every instance of this customer, newest first.',
            empty:
              'None of the instances of this customer has been invoiced yet.',
          },
        },
        instances: {
          title: 'Instances',
          description: 'Deployments for this customer.',
          empty: 'No instances found for this customer.',
          columns: {
            name: 'Name',
            license: 'License',
            type: 'Type',
            status: 'Status',
            billing: 'Billing',
            lifecycle: 'Lifecycle',
            start: 'Start',
            end: 'End',
          },
        },
      },
      Mutation: {
        titleNew: 'New Customer',
        titleUpdate: 'Edit Customer',
        deleteSuccess: 'Customer deleted successfully',
        Form: {
          Labels: {
            name: 'Name',
            customId: 'External ID',
            domain: 'Domain',
            slug: 'Slug',
            billingEmail: 'Billing e-mail',
          },
          Placeholders: {
            name: 'Acme Inc.',
            customId: 'HubSpot ID',
            domain: 'acme.com',
            slug: 'acme-inc',
            billingEmail: 'billing@acme.com',
          },
          Descriptions: {
            name: 'The company or organization, as your team knows it.',
            customId:
              'Ties this customer to its record in your own systems, such as Salesforce or HubSpot. It does not need to be unique.',
            domain:
              'Primary domain of the customer (e.g. acme.com). Optional, used by CRM integrations among others.',
            slug: 'Auto-generated — edit to set a custom one.',
            slugLocked:
              "Set when the customer was created. It can't be changed.",
            billingEmail:
              'Where the invoices of this customer are addressed, for your accounting system. Optional: empty it to remove it.',
          },
          Errors: {
            name: 'Name is required',
            domain: 'Domain must be a valid domain name (e.g. acme.com)',
            billingEmail:
              'Enter a valid e-mail address, such as billing@acme.com',
            billingEmailTooLong:
              'The e-mail address is too long (254 characters at most)',
            slugShadowed:
              'This slug is the address of a page of the console. Choose another one.',
          },
          createSuccess: 'Customer created successfully',
          updateSuccess: 'Customer updated successfully',
          createButton: 'Create Customer',
          updateButton: 'Update Customer',
        },
      },
      Instances: {
        title: 'Instances',
        subtitle: 'Deployed instances across all customers',
        confirmDeleteTitle: 'Delete this instance?',
        confirmDeleteDescription:
          'This will permanently delete {{name}} and all data tied to it — usage history, reported metrics, and integration links. This cannot be undone.',
        Table: {
          Columns: {
            name: 'Name',
            description: 'Description',
            customer: 'Customer',
            crmSync: 'CRM Sync',
            license: 'License',
            status: 'Status',
            billing: 'Billing',
            lifecycleStage: 'Lifecycle',
            metadata: 'Metadata',
            extraMetadata: 'Extra metadata',
            customerName: 'Customer',
            licenseType: 'License Type',
            features: 'Features',
            host: 'Host',
            plan: 'Plan',
          },
          Dialogs: {
            metadataTitle: 'Instance metadata',
            metadataDescription:
              'Operational metadata returned by the instance API contract.',
            metadataTrigger: 'Open instance metadata',
            extraMetadataTitle: 'Extra metadata',
            extraMetadataDescription:
              'Values reported on this instance that are not covered by an active metadata field schema.',
            extraMetadataTrigger: 'Open extra metadata',
          },
        },
        Mutation: {
          titleNew: 'New Instance',
          titleUpdate: 'Edit Instance',
          deleteSuccess: 'Instance deleted successfully',
          Form: {
            mainTitle: 'Main Information',
            licenseTitle: 'License',
            Labels: {
              name: 'Name',
              description: 'Description',
              customerId: 'Customer',
              slug: 'Slug',
              licenseId: 'License',
              licenseKey: "License's Version",
              licenseDate: 'License Date',
              deploymentZoneId: 'Deployment zone',
            },
            Placeholders: {
              name: 'Acme Production',
              description: 'Acme Inc. production instance',
              customerId: 'Select a customer',
              customerIdSearch: 'Search for a customer',
              slug: 'acme-production',
              licenseId: 'Select a license',
              licenseKey: 'Select a version',
              deploymentZoneId: 'Select a deployment zone',
              deploymentZoneIdSearch: 'Search for a deployment zone',
              noDeploymentZone: 'No deployment zone',
            },
            Descriptions: {
              name: 'Tells this deployment apart, e.g. by its environment.',
              customerId: 'The customer this instance belongs to.',
              slug: 'Auto-generated — edit to set a custom one.',
              licenseId:
                'The license version that sets what this instance is entitled to. Archived versions are no longer offered.',
              licenseKey: 'The version of that license this instance runs.',
              licenseDate: 'License expiration date',
              deploymentZoneId:
                'Optional. Leave empty to create the instance without a zone and deploy it later.',
            },
            LicenseOptions: {
              label: '{{name}} v{{version}}',
              draft: '{{label}} (draft)',
              archived: '{{label}} (archived)',
            },
            Steps: {
              instanceInformations: 'Instance information',
              chooseLicense: 'Choose the license',
              deployment: 'Deployment',
              metadata: 'Metadata',
            },
            createButton: 'Create Instance',
            updateButton: 'Update Instance',
            createSuccess: 'Instance created successfully',
            updateSuccess: 'Instance updated successfully',
            updateError: 'Error updating instance',
            Frozen: {
              openSubscription: 'Open the subscription',
            },
          },
        },
        Deployment: {
          deployAction: 'Deploy',
          migrateAction: 'Migrate',
          deployTitle: 'Deploy {{name}}',
          migrateTitle: 'Migrate {{name}}',
          deployDescription:
            'This instance has no deployment zone yet. Pick the zone it should run in.',
          migrateDescription:
            'Move this instance to another deployment zone. It will pick up the release deployed on the target zone.',
          currentZone: 'Current deployment zone',
          targetZone: 'Deployment zone',
          targetZonePlaceholder: 'Select a deployment zone',
          noZoneAvailable: 'No other deployment zone is available.',
          deploySuccess: 'Instance deployed successfully',
          migrateSuccess: 'Instance migrated successfully',
        },
        Detail: {
          editName: 'Edit name',
          Billing: {
            loading: 'Loading billing',
            NotSubscribed: {
              title: 'Not subscribed',
              description:
                'No subscription bills this instance yet. Subscribe it to a price of its license to start invoicing.',
            },
            Subscribe: {
              title: 'Subscribe',
              open: 'Subscribe',
              dialogTitle: 'Subscribe {{name}}',
              description:
                'Pin this instance to a price of its license and start billing it. Invoices are recorded here and handed to your own system.',
              confirm: 'Subscribe',
              provider: 'Payment provider',
              providerHint:
                'Invoices are recorded here and handed to your ERP. Nothing is collected from the customer.',
              basePrice: 'Base price',
              basePriceHint:
                'The flat fee this subscription is pinned to. Only the active flat fees of the license version are offered.',
              priceOption: '{{label}} · {{price}} · {{timing}}',
              daysUntilDue: 'Payment terms (days)',
              daysUntilDueHint:
                'Days between issuing an invoice and its due date. Leave empty to use the terms of your organization.',
              daysUntilDuePlaceholder: 'Organization default: {{days}}',
              daysUntilDuePlaceholderUnknown: 'Organization default',
              trialDays: 'Trial (days)',
              trialDaysHint:
                'Nothing is billed during the trial, and its usage is never billed. The first invoice is issued when it ends; 0 starts billing at once. The license can carry a default.',
              trialDaysArrears:
                'A trial is not offered on a plan billed in arrears: the subscription starts without one.',
              startAt: 'Billing starts (UTC)',
              startAtHint:
                'Leave empty to start now. A contract that began earlier can start up to one billing period back, never in the future.',
              licenseNotPublished:
                'This instance runs {{name}} v{{version}} ({{state}}). Only a published license version can be subscribed to.',
              licenseNotPublishedDialog:
                '{{name}} v{{version}} is not published, and only a published license version can be subscribed to. Move the instance to a published version first.',
              noBasePrice:
                '{{name}} v{{version}} has no active flat fee to subscribe to. Add one on the license first.',
              Summary: {
                trial:
                  'No invoice now. The first invoice is issued at the end of the trial, on {{date}}.',
                now: 'The first invoice is issued as soon as the subscription starts.',
                arrears:
                  'Nothing is invoiced until the first period closes: the first invoice is issued on {{date}}.',
                arrearsDue:
                  'The first period already closed on {{date}}: its invoice is issued shortly after the subscription starts.',
              },
              Started: {
                title: 'Subscription started',
                trial:
                  'The trial runs until {{date}}, and the first invoice is issued then.',
                period: 'Current period:',
                activation: 'Activation invoice:',
                viewInvoice: 'View the invoice',
                noActivation:
                  'Nothing is invoiced yet: the first invoice is issued on {{date}}.',
              },
              Addons: {
                title: 'Add-ons',
                description:
                  'Optional. They are attached when the subscription starts and billed from its first invoice. If one cannot be attached, the subscription does not start.',
                maxQuantity_one: 'Up to {{count}} unit',
                maxQuantity_other: 'Up to {{count}} units',
              },
              BillingEmail: {
                title: '{{customer}} has no billing e-mail',
                description:
                  'Invoices carry this address for your accounting system. Set it now, or later from the customer page.',
                label: 'Billing e-mail',
                placeholder: 'billing@example.com',
                save: 'Save e-mail',
                saved: 'Billing e-mail saved',
              },
              Errors: {
                addOns:
                  'Enter a whole number of units for each add-on, within what it allows',
                basePrice: 'Choose a base price',
                daysUntilDue: 'Enter a whole number of days, from 0 to 365',
                trialDays: 'Enter a whole number of days, from 0 to 365',
                startAt: 'Enter a valid date and time',
                startAtFuture: 'Billing cannot start in the future',
                startAtTooEarly:
                  'Billing cannot start more than one billing period ago',
                startAtBeforeCancellation:
                  'Billing cannot start before the previous subscription was canceled',
              },
              Voucher: {
                label: 'Voucher code',
                placeholder: 'Paste the code',
                hint: 'Optional. The code is redeemed with the subscription; if it cannot be redeemed, the subscription is not started. You can check it first, against the price chosen.',
                check: 'Check the code',
                validNote:
                  'It can be redeemed with this subscription, on the price chosen. The subscription checks it again when it starts.',
              },
            },
            Subscription: {
              title: 'Subscription',
              description: 'How this instance is billed.',
              descriptionEnded:
                'This subscription has ended. Subscribe the instance again to resume billing.',
              fields: {
                status: 'Status',
                pastDueSince: 'Past due since',
                provider: 'Provider',
                collection: 'Collection',
                terms: 'Payment terms',
                basePrice: 'Base price',
                currentPeriod: 'Current period',
                canceledAt: 'Canceled on',
                cancellationReason: 'Reason',
                nextBoundary: 'Next boundary',
                endsAt: 'Ends on',
                trialEndsAt: 'Trial ends',
                firstInvoice: 'First invoice',
                startedAt: 'Started',
              },
              collectionMethod: {
                CHARGE_AUTOMATICALLY: 'Charged automatically',
                SEND_INVOICE: 'Invoice sent to the customer',
              },
              termsSource: {
                contract: 'This contract',
                organization: 'Organization default',
              },
              daysUntilDue_one: 'Payable within {{count}} day',
              daysUntilDue_other: 'Payable within {{count}} days',
              priceLine: '{{price}} · {{timing}}',
              nextBoundaryHint:
                'The period ends then and its invoice is composed.',
              endsAtHint:
                'The subscription ends then, after its final invoice.',
            },
            Upcoming: {
              title: 'Upcoming invoice',
              description:
                'What the next boundary will issue, composed from the usage so far. Nothing is saved or billed.',
              loading: 'Loading the upcoming invoice',
              view: 'View the lines',
              kind: 'Type',
              issuedAt: 'Issued at',
              period: 'Service period',
              lines: 'Lines',
              lineCount_one: '{{count}} line',
              lineCount_other: '{{count}} lines',
              total: 'Total',
              asOf: 'Composed {{date}} from the usage so far.',
              dialogTitle: 'Upcoming invoice',
              dialogDescription:
                'The invoice the next boundary would issue. It is a preview: nothing is saved, sent or billed.',
              WouldHold: {
                title: 'This invoice would be held',
                description:
                  'The usage journal of these meters fails a check, and billing does not issue an invoice it cannot vouch for:',
                item: '{{entitlement}}: {{reason}}.',
                unknownEntitlement: 'An entitlement',
                history: 'See its usage history',
              },
              OutsideRetention: {
                title:
                  'No preview: the usage history no longer covers this period',
                explanation:
                  'The next invoice bills usage from the start of this billing period, and the reports of its first days are older than the usage your organization keeps. Kaiten cannot rate them to show the invoice here.',
                keptFor_one:
                  'Your organization keeps usage for {{count}} month.',
                keptFor_other:
                  'Your organization keeps usage for {{count}} months.',
                invoiceUnaffected:
                  'The invoice itself is not affected: it is composed when the period closes, from the usage that was recorded.',
              },
            },
            Invoices: {
              description:
                'Every invoice of this instance, across the times it was subscribed, newest first.',
              empty: 'No invoice has been issued for this instance yet.',
            },
            Reactivate: {
              action: 'Reactivate',
              success: 'The cancellation was taken back',
              subscribeAgain: 'Subscribe again',
            },
            Notices: {
              Trial: {
                title: 'Trial until {{date}}',
                description_one:
                  '{{count}} day left. Nothing is billed during the trial, and its usage is never billed.',
                description_other:
                  '{{count}} days left. Nothing is billed during the trial, and its usage is never billed.',
                firstInvoice: 'The first invoice is issued on {{date}}.',
              },
              PastDue: {
                title_one: 'Past due since {{date}} ({{count}} day)',
                title_other: 'Past due since {{date}} ({{count}} days)',
                titleUnknown: 'Past due',
                invoice:
                  'The {{kind}} invoice for {{period}} has been unpaid since it fell due on {{due}}.',
                invoiceUnknown:
                  'An invoice of this subscription is unpaid past its due date.',
                viewInvoice: 'View the invoice',
                accessUnchanged:
                  'Access is unchanged: Kaiten does not restrict a customer with an unpaid invoice in this version.',
              },
              Cancellation: {
                title: 'Cancels on {{date}}',
                description:
                  'The period is paid for, so nothing changes until then. At that boundary a final invoice bills what was used in arrears, which may be nothing, and the subscription ends. You can take the cancellation back until then.',
                reason: 'Reason: {{reason}}',
              },
              ScheduledChange: {
                title: 'Changes to {{plan}} ({{amount}}) on {{date}}',
                description:
                  'Nothing is prorated: the invoice of that day bills what the current plan owes in arrears and the first period of the new plan in advance.',
              },
            },
            Cancel: {
              title: 'Cancel',
              open: 'Cancel subscription',
              dialogTitle: 'Cancel the subscription of {{name}}',
              dialogDescription:
                'Ends the billing of this instance. Nothing else about it changes, unless you choose it below.',
              confirm: 'Cancel subscription',
              confirmTrial: 'End the trial',
              keep: 'Keep the subscription',
              keepTrial: 'Keep the trial',
              notSubscribed: 'This instance has no subscription to cancel.',
              alreadyCanceled: 'This subscription is already canceled.',
              Fields: {
                mode: 'When',
                reason: 'Reason',
                reasonPlaceholder: 'Why does the subscription end? (optional)',
                reasonCounter: '{{count}}/{{max}} characters',
              },
              Mode: {
                AT_PERIOD_END: 'At the end of the period: {{date}}',
                IMMEDIATE: 'Immediately',
              },
              Explain: {
                scheduled: {
                  title: 'The subscription ends on {{date}}',
                  already:
                    'It is already set to end then: confirming again changes nothing. Choose Immediately to end it now.',
                  paid: 'The period is paid for, so access and entitlements do not change until {{date}}.',
                  invoice:
                    'At that boundary a final invoice bills what was used in arrears, which may be nothing, and no new period starts.',
                  undo: 'You can reactivate the subscription from the Billing tab until then.',
                },
                immediate: {
                  title: 'The subscription ends now',
                  invoice:
                    'A final invoice is issued now for usage to date. No proration. The base fee already paid for this period is not refunded.',
                  arrears:
                    'What bills in arrears is billed in full for the part of the period that has gone by.',
                  final:
                    'This cannot be undone: to bill the instance again, subscribe it anew.',
                },
                planChangeDropped:
                  'The plan change scheduled for {{date}} is dropped by this cancellation.',
                trial: {
                  title: 'The trial ends now',
                  nothing:
                    'Nothing is billed: no invoice is issued, and the usage of the trial is never billed.',
                },
              },
              FollowUps: {
                title: 'Beside the cancellation',
                description:
                  'Cancelling changes billing only. Add-ons, voucher redemptions and the license dates stay as they are, and invoices already issued stay collectible, unless you choose otherwise here.',
                removeAddons: 'Also remove the add-ons',
                removeAddonsDescription:
                  'Takes {{addons}} off the instance now. Their entitlements end at once and nothing is refunded.',
                removeAddonsLoading: 'Reading the add-ons of this instance…',
                removeAddonsNone: 'This instance holds no add-on.',
                removeAddonsUnknown:
                  'The add-ons of this instance could not be read.',
                setEndDate: 'Also set the license end date',
                setEndDateDescription:
                  'The license of this instance ends on {{date}}. Entitlements follow it, not the subscription.',
                endDate: 'License ends (UTC)',
              },
              Done: {
                scheduledTitle: 'Cancellation scheduled',
                scheduled:
                  'The subscription ends on {{date}}. Until then nothing changes, and you can reactivate it from the Billing tab.',
                immediateTitle: 'Subscription canceled',
                immediate:
                  'The subscription has ended and its final invoice was issued.',
                finalInvoice: 'Final invoice:',
                viewInvoice: 'View the invoice',
                noFinalInvoice: 'The API returned no final invoice.',
                trialTitle: 'Trial ended',
                trial: 'The subscription is canceled. Nothing was billed.',
                addonsRemoved: 'Add-ons removed: {{addons}}.',
                addonFailed: '{{addon}} could not be removed. {{detail}}',
                endDateSet: 'The license now ends on {{date}}.',
                endDateFailed:
                  'The end of the license could not be set. {{detail}}',
                retryFollowUps: 'Try again',
              },
              Errors: {
                reason: 'The reason is at most 500 characters',
                endDate: 'Enter a valid date and time',
              },
            },
            PlanChange: {
              title: 'Plan change',
              open: 'Change plan',
              dialogTitle: 'Change the plan of {{name}}',
              dialogDescription:
                'Moves the subscription to another plan at the end of the current period.',
              version: '{{name}} v{{version}}',
              currentPlan: 'Current plan:',
              currentPlanValue: '{{price}} · {{amount}}',
              timeline:
                'The change takes effect on {{date}}, when the current period ends. The invoice of that day bills what the current plan owes in arrears and the first period of the new plan in advance. Nothing is prorated.',
              upcoming:
                'Without the change, the next invoice would be a {{kind}} invoice of',
              upcomingScheduled:
                'The next invoice already applies the scheduled change: a {{kind}} invoice of',
              noPreview:
                'Kaiten cannot compose the invoice of a change that is not scheduled yet, so this is the invoice as things stand.',
              target: 'New plan',
              targetHint:
                'The active flat fees of the license versions on sale, in the currency of the subscription.',
              targetPlaceholder: 'Choose a plan',
              option: '{{version}} · {{price}} · {{amount}} · {{timing}}',
              optionBlocked: '{{label}} — Different currency ({{currency}})',
              noPlan:
                'No other plan can be reached: no other published license version has an active flat fee.',
              confirm: 'Schedule the change',
              alreadyScheduled:
                'A change to {{plan}} ({{amount}}) is already scheduled for {{date}}. Choosing another plan replaces it.',
              drop: 'Cancel the change',
              scheduledToast: 'The plan change is scheduled',
              droppedToast: 'The plan change was canceled',
              notSubscribed: 'This instance has no subscription.',
              alreadyCanceled:
                'This subscription has ended: subscribe the instance again to choose a plan.',
              trial:
                'A plan cannot change during a trial. Cancel the trial and subscribe the instance again with the new plan.',
              cancellationScheduled:
                'A cancellation is scheduled for the end of the period. Reactivate the subscription first to change its plan.',
              Errors: {
                target: 'Choose a plan',
              },
            },
            Terms: {
              title: 'Payment terms',
              open: 'Payment terms',
              dialogTitle: 'Payment terms of {{name}}',
              dialogDescription:
                'The days between the issue of an invoice and its due date, for this contract.',
              currentContract_one:
                'Invoices are payable within {{count}} day (the terms of this contract).',
              currentContract_other:
                'Invoices are payable within {{count}} days (the terms of this contract).',
              currentOrganization_one:
                'Invoices are payable within {{count}} day (the default of your organization).',
              currentOrganization_other:
                'Invoices are payable within {{count}} days (the default of your organization).',
              daysUntilDue: 'Payment terms (days)',
              daysUntilDueHint:
                'From 0 to 365 days. Leave empty to use the terms of your organization.',
              placeholder: 'Organization default: {{days}}',
              placeholderUnknown: 'Organization default',
              nextInvoice:
                'The change takes effect on the next invoice. Invoices already issued keep their own due date.',
              save: 'Save',
              useDefault: 'Use organization default',
              notSubscribed: 'This instance has no subscription.',
              alreadyCanceled:
                'This subscription has ended: it has no terms to change.',
              openWithProvider: 'Provider and terms',
              dialogTitleWithProvider: 'Provider and terms of {{name}}',
              dialogDescriptionWithProvider:
                'Who collects the invoices of this contract and how, and the days between the issue of an invoice and its due date.',
              Provider: {
                label: 'Collected by',
                description:
                  'Who issues and collects the invoices, from the next one on. Invoices already composed keep their own provider.',
                NOOP: 'Manual hand-off',
                STRIPE: 'Stripe',
                STRIPE_notConnected: 'Stripe (not connected)',
                notConnected:
                  'Stripe is not connected for your organization yet: connect it to collect the invoices of this contract through it.',
                connect: 'Connect Stripe',
              },
              Collection: {
                label: 'Collection method',
                description:
                  'Sending the invoice lets the customer pay it. Charging automatically takes the payment method the customer saved with Stripe.',
                SEND_INVOICE: 'Send the invoice',
                CHARGE_AUTOMATICALLY: 'Charge automatically',
                unavailable: '{{method}} (needs Stripe)',
              },
              Warnings: {
                customer: 'Open the customer',
                billingEmail:
                  'This customer has no billing e-mail, and Stripe sends the invoices there.',
                paymentMethod:
                  'This customer has no payment method Stripe can charge.',
                fromNextInvoice:
                  'The change takes effect from the next invoice; invoices already issued keep their provider.',
              },
              Switch: {
                title: 'Invoices still open',
                description:
                  'Every invoice keeps its own provider, collection method and terms. This is what happens to each one.',
                empty: 'This contract has no open invoice.',
                Fate: {
                  manual:
                    'Ready to bill: it is settled only by marking it paid or writing it off, and it still counts toward a late payment.',
                  held: 'Held: releasing it issues it under the provider it was composed for, and recomposing it uses the new provider.',
                  queued:
                    'It keeps being pushed to Stripe for as long as Stripe stays connected.',
                  review:
                    'It waits in Stripe to be finalized, or for a push from here.',
                  collected:
                    'Stripe collects it and Kaiten mirrors it. Stripe cannot be disconnected while it is open.',
                  other: 'It keeps its own provider and terms.',
                },
                Move: {
                  choose:
                    'Release it to keep its provider, or recompose it to move it: choose deliberately.',
                  voidAndRecompose: 'To move it: void it, then recompose it.',
                  voidDeletesDraft:
                    'To move it: void it, which deletes the draft in Stripe, then recompose it.',
                  voidInBoth:
                    'To move it: void it in both systems, then recompose it. Only do it if the customer must stop paying through Stripe.',
                },
              },
              Toasts: {
                saved: 'The payment terms are saved',
                reset: 'The terms of your organization apply again',
              },
              Errors: {
                daysUntilDue: 'Enter a whole number of days, from 0 to 365',
              },
            },
            Addons: {
              title: 'Add-ons',
              description:
                'Extra entitlements this instance holds on top of its license, billed with its subscription.',
              loading: 'Loading the add-ons',
              attach: 'Add an add-on',
              note: 'Entitlement changes now; billed from the next renewal; no proration or refund.',
              notLive:
                'Add-ons can be added while the subscription is live. Before that, add them when subscribing the instance.',
              Empty: {
                title: 'No add-on',
                description:
                  'This instance holds no add-on. Add one to raise its limits or switch on a feature.',
              },
              Table: {
                Columns: {
                  addon: 'Add-on',
                  quantity: 'Quantity',
                  price: 'Price per unit',
                  since: 'Since',
                },
                free: 'Free',
                onRequest: 'On request',
                notBilled: 'Not billed',
                withdrawn: 'Withdrawn',
                withdrawnHint:
                  'This version was withdrawn from sale. The instance keeps it until it is removed.',
              },
              Quantity: {
                group: 'Quantity of {{name}}',
                decrease: 'One unit fewer of {{name}}',
                increase: 'One unit more of {{name}}',
              },
              Remove: {
                action: 'Remove',
                aria: 'Remove {{name}}',
                title: 'Remove {{name}} from this instance?',
                description: 'Its entitlements end at once.',
                refund:
                  'The current period is not refunded, and the add-on is no longer billed from the next invoice.',
                arrears:
                  'This add-on is billed in arrears: the period under way is still billed in full, at the last quantity held, on the next invoice. Nothing is refunded.',
                usage:
                  'Its usage until it is removed is billed on the next invoice.',
                confirm: 'Remove',
              },
              Toasts: {
                attached: '{{name}} added (× {{quantity}})',
                quantity: '{{name}}: now × {{quantity}}',
                removed: '{{name}} removed',
              },
              Effect: {
                change: '{{entitlement}}: {{before}} → {{after}}',
                configured: 'Configured',
                none: 'Not granted',
              },
              Unread: {
                all: 'The add-ons could not be read, so none is offered.',
                partial:
                  'Some add-ons could not be checked against the license of this instance, so they are not listed.',
              },
              Attach: {
                title: 'Add an add-on',
                dialogTitle: 'Add an add-on to {{name}}',
                description:
                  'Attach an add-on to this instance. Its entitlements apply at once.',
                addon: 'Add-on',
                addonHint:
                  'The add-ons on sale that fit the license of this instance.',
                addonPlaceholder: 'Choose an add-on',
                quantity: 'Quantity',
                quantityHint: 'At least 1.',
                quantityHintMax: 'From 1 to {{max}}.',
                confirm: 'Add the add-on',
                none: 'No add-on can be added: none on sale fits the license of this instance, or it holds a version of each already.',
                notLive:
                  'Add-ons can only be added while the subscription is live: in trial, active or past due.',
                Price: {
                  perUnit: 'per unit, billed from the next renewal.',
                  free: 'Free: nothing is billed for it.',
                  custom:
                    'Sold on request: no price is set, so nothing is billed for it here.',
                  none: 'This add-on has no default price for the billing period of the subscription ({{period}}), and the API will refuse it.',
                  metered: 'Its usage is billed too: {{prices}}.',
                  meteredEntry: '{{label}}: {{amount}}',
                  meteredOnly:
                    'Billed on its usage, at the end of each period: {{prices}}.',
                  unpriced:
                    'This add-on has no price on sale, so nothing is billed for it here.',
                  loading: 'Reading its price…',
                  unknown: 'Its price could not be read.',
                },
                BelowLicense: {
                  message:
                    '{{addon}} overrides {{entitlement}} with {{value}}, and the license of this instance, {{name}}, grants {{license}}.',
                  consequence:
                    'Attaching it lowers the limit of this instance below what its license grants. The API accepts it; check that it is what you mean.',
                },
                Errors: {
                  addon: 'Choose an add-on',
                  quantity: 'Enter a whole number of units, at least 1',
                  quantityLimit: 'Enter at most 2,147,483,647 units',
                  quantityMax: 'This add-on allows fewer units',
                },
              },
            },
            Vouchers: {
              apply: 'Apply a code',
              description:
                'The vouchers this instance redeemed. A boost changes its limits while it lasts; a discount reduces the invoices it is issued.',
              empty:
                'This instance has not redeemed any voucher. Apply a code to give it a boost or a discount.',
              Redeem: {
                breadcrumb: 'Apply a code',
                title: 'Apply a code to {{name}}',
                description:
                  'The code is checked first: nothing is redeemed until you confirm.',
                doneTitle: 'Code applied to {{name}}',
                doneDescription:
                  'What follows is read from the instance before and after the redemption.',
                code: 'Voucher code',
                codePlaceholder: 'Paste the code',
                codeHint: 'Letters and digits; case and dashes do not matter.',
                check: 'Check the code',
                confirm: 'Redeem the code',
                validTitle: '{{name}} can be redeemed',
                validNote:
                  '{{instance}} meets every condition of this voucher. Redeeming applies it now; only revoking it takes it back.',
                invalidTitle: 'This code cannot be redeemed',
                Errors: {
                  code: 'Enter the code',
                  codeTooLong: 'A code has at most 64 characters',
                },
              },
              Reasons: {
                NOT_FOUND: 'No voucher has this code.',
                NOT_ACTIVE:
                  'This voucher is not active: it is a draft or it was archived.',
                NOT_YET_VALID:
                  'This voucher cannot be redeemed yet: its window has not opened.',
                EXPIRED: 'This voucher has expired.',
                EXHAUSTED:
                  'This voucher has been redeemed as many times as it allows.',
                ALREADY_REDEEMED:
                  'This instance has already redeemed this voucher.',
                NOT_ELIGIBLE: 'This instance is not eligible for this voucher.',
                CURRENCY_MISMATCH:
                  'This discount is in a currency other than the one of the subscription.',
              },
              Rules: {
                RESTRICTED_CUSTOMER:
                  'This voucher is reserved for another customer.',
                LICENSE_NOT_APPLICABLE:
                  'This voucher does not apply to the license of this instance.',
                ADDON_NOT_APPLICABLE:
                  'This voucher needs an add-on that this instance does not hold.',
                FIRST_TIME_ONLY:
                  'This voucher is for customers that have not paid an invoice yet.',
                ANNUAL_ONLY: 'This voucher needs an annual subscription.',
                MINIMUM_SUBSCRIPTION_AMOUNT:
                  'The subscription is below the minimum amount this voucher requires.',
                NOTHING_TO_BOOST:
                  'This boost changes nothing this instance has: none of the entitlements it targets is a number that the instance holds.',
              },
              Outcome: {
                voucher: 'Voucher',
                status: 'Status',
                until: 'Applies until',
                applications: 'Discounts',
                invoices_one: 'The next invoice',
                invoices_other: 'The next {{count}} invoices',
                everyInvoice: 'Every invoice',
                changes: 'What changed',
                nextInvoice: 'The next invoice',
                before: 'Before',
                after: 'After',
                discount: 'Discount',
                discountNote:
                  'The discount will show on the next invoice this instance is issued.',
              },
            },
          },
          tabs: {
            overview: 'Overview',
            entitlements: 'Entitlements & Usage',
            billing: 'Billing',
            auditTrail: 'Audit Trail',
          },
          status: {
            healthy: 'Healthy',
            degraded: 'Degraded',
            incident: 'Incident',
            maintenance: 'Maintenance',
          },
          lifecycleStage: {
            trial: 'Trial',
            active: 'Active',
            atRisk: 'At risk',
            churned: 'Churned',
          },
          fallback: {
            unknownCustomer: 'Unknown customer',
            unknownLicense: 'Unknown license',
          },
          quickStats: {
            licenseExpires: 'License Expires',
            instanceStatus: 'Instance Status',
            entitlements: 'Entitlements',
            entitlementsUnderLimit: 'under their limit',
            licenseType: 'License Type',
            usageAlerts: 'Usage Alerts',
            nearLimit: 'near limit',
            limitReached_one: 'limit reached',
            limitReached_other: 'limits reached',
            nearLimitCurrentPeriod_one:
              '{{count}} resets with its current usage window',
            nearLimitCurrentPeriod_other:
              '{{count}} reset with their current usage window',
            days: 'days',
            expired: 'Expired',
            unknown: 'Unknown',
          },
          instanceDetails: {
            title: 'Instance Details',
            description: 'General information about this instance',
          },
          statusEditor: {
            title: 'Operational Status',
            label: 'Status',
            changed: 'Status set to {{status}}',
          },
          lifecycleStageEditor: {
            title: 'Lifecycle Stage',
            label: 'Lifecycle stage',
            placeholder: 'Select or type a stage',
            searchPlaceholder: 'Search or create a stage',
            none: 'No lifecycle stage',
          },
          fields: {
            name: 'Name',
            description: 'Description',
            customer: 'Customer',
            instanceId: 'Instance ID',
          },
          license: {
            title: 'License',
            plan: 'Plan',
            type: 'Type',
            version: 'Version',
            period: 'License period',
          },
          metadata: {
            title: 'Metadata',
            description: 'Values declared by your metadata field schema',
            empty: 'No metadata field declared',
            emptyHelper:
              'Declare instance metadata fields in the settings to see them here.',
            extra: 'Extra metadata',
          },
          release: {
            title: 'Release',
            description: 'Release currently deployed on this instance',
            version: 'Version',
            status: 'Status',
            deploymentZone: 'Deployment zone',
            deployedAt: 'Deployed at',
            empty: {
              title: 'Not deployed yet',
              description:
                'This instance is not attached to a deployment zone. Deploy it to see the release it runs.',
            },
          },
          audit: {
            createdAt: 'Created',
            updatedAt: 'Last updated',
            by: 'by',
          },
          links: {
            viewLicense: 'View license',
            openRelease: 'Open release',
            viewDeploymentZone: 'View deployment zone',
          },
          entitlements: {
            unknownEntitlement: 'Unknown entitlement',
            empty: 'No entitlement usage data available',
            unlimited: 'Unlimited',
            softLimitHint: '(+{{percent}}% overage)',
            softLimitDescription:
              'Soft limit: usage is accepted up to {{max}} before being rejected.',
            lifetime: 'Lifetime',
            periodRange: '{{start}} → {{end}}',
            filters: {
              allGroups: 'All groups',
              clear: 'Clear filter',
              groupLabel: 'Filter entitlements by group',
            },
            usage: {
              title: 'Usage Overview',
              description:
                'Visual overview of entitlement consumption for this instance',
              currentWindow: 'Current window: {{start}} → {{end}}',
            },
            provenance: {
              title: 'How this limit is composed',
              trigger:
                '{{limit}}: how the limit of {{entitlement}} is composed',
              fromAddons: 'from add-ons',
              unlimitedBy: 'Unlimited, granted by {{sources}}',
              grantedBy: {
                license: 'the license',
                addon: 'an add-on',
                voucher: 'a voucher',
              },
              terms: {
                license: '{{amount}} license',
                addon: '{{amount}} add-on',
                addonReplace: '{{amount}} add-on (replaces the license)',
                highest: 'max({{terms}})',
                voucher: '{{amount}} voucher',
                voucherSet:
                  '{{amount}} voucher (replaces the license and the add-ons)',
              },
            },
            table: {
              title: 'All Entitlements',
              description:
                'Detailed view of all entitlements associated via the license',
              headers: {
                entitlement: 'Entitlement',
                type: 'Type',
                usage: 'Usage',
                threshold: 'Threshold',
                currentPeriod: 'Current window',
                status: 'Status',
                history: 'History',
              },
            },
            status: {
              enabled: 'Enabled',
              disabled: 'Disabled',
              unknown: 'Unknown',
            },
            history: {
              open: 'History',
              openLabel: 'Usage history of {{entitlement}}',
              title: 'Usage history',
              description:
                '{{entitlement}} on {{instance}}: every report accepted for this counter, in the order it was accepted.',
              region: 'Usage reports of {{entitlement}}',
              loading: 'Loading the usage history',
              period: 'Period (UTC)',
              defaultPeriod:
                'With no period, the last 30 days are shown, as far back as your organization keeps usage.',
              export: 'Export CSV',
              exportTooLong:
                'A CSV covers up to 366 days: narrow the period to export it.',
              Empty: {
                title: 'No usage reports',
                description: 'No report was accepted during this period.',
              },
              loadMore: 'Load more reports',
              OutsideRetention: {
                title_one: 'Beyond your retention of {{count}} month',
                title_other: 'Beyond your retention of {{count}} months',
                titleUnknown: 'Beyond what your organization keeps',
                showFrom: 'Show from {{date}}',
              },
            },
          },
          auditTrail: {
            stats: {
              totalEvents: 'Total Events',
              read: 'Reads',
              accepted: 'Accepted',
              rejected: 'Rejected',
              warnings: 'Warnings',
              today: 'Today',
            },
            charts: {
              activityTimeline: {
                title: 'Activity Timeline',
                description: 'Entitlement access events over the last period',
                allEntitlements: 'All entitlements',
                allGroups: 'All groups',
                empty: 'No activity data for this period',
                entitlementFilterLabel: 'Filter timeline by entitlement',
                groupFilterLabel: 'Filter timeline by group',
                modeLabel: 'Change activity timeline mode',
                modes: {
                  status: 'By status',
                  group: 'By group',
                },
                showLabel: 'Show:',
                visibleGroupsLabel: 'Visible groups',
                visibleGroupsPlaceholder: 'Visible groups',
                visibleGroupsSearchPlaceholder: 'Search groups',
                visibleGroupsEmpty: 'No matching groups',
                visibleGroupsCount_one: '{{count}} group visible',
                visibleGroupsCount_other: '{{count}} groups visible',
                series: {
                  read: 'Read',
                  accepted: 'Accepted',
                  rejected: 'Rejected',
                  warning: 'Warning',
                },
              },
              valueOverTime: {
                title: 'Value Over Time',
                description:
                  'Track how a numeric entitlement value evolves across audit trail events',
                currentLabel: 'Current:',
                currentTotalLabel: 'Current lifetime total:',
                empty: 'No numeric data for this entitlement',
                emptyGroup: 'No numeric data for this group',
                groupBadge: 'Group',
                groupFilterLabel: 'Select a numeric group',
                groupTotalLabel: 'Group total (lifetime counters)',
                noGroupTotal:
                  'No lifetime counter in this group to total. Select entitlements to plot them individually.',
                periodicBadge: 'Resets per window',
                periodicSuffix: 'per window',
                modeLabel: 'Change value-over-time mode',
                modes: {
                  entitlement: 'By entitlement',
                  group: 'By group',
                },
                numericEntitlementsCount_one: '{{count}} numeric entitlement',
                numericEntitlementsCount_other:
                  '{{count}} numeric entitlements',
                allEntitlements: 'All entitlements',
                selectAll: 'Select all',
                clearIndividualLines: 'Clear individual lines',
                entitlementFilterLabel: 'Select a numeric entitlement',
                visibleEntitlementsEmpty: 'No matching entitlements',
                visibleEntitlementsLabel: 'Visible entitlements',
                visibleEntitlementsSearchPlaceholder: 'Search entitlements',
                visibleEntitlementsCount_one: '{{count}} entitlement visible',
                visibleEntitlementsCount_other:
                  '{{count}} entitlements visible',
                visibleEntitlementLinesCount_one:
                  '{{count}} entitlement line shown',
                visibleEntitlementLinesCount_other:
                  '{{count}} entitlement lines shown',
                valueLabel: 'Value',
              },
            },
            table: {
              title: 'Event Log',
              description:
                'Immutable record of all entitlement operations on this instance',
              autoRefresh: 'Auto-refreshes',
              searchPlaceholder: 'Search by entitlement, event...',
              empty: 'No audit trail entries found',
              actions: {
                viewDetails: 'View details',
              },
              headers: {
                id: '#',
                event: 'Event',
                entitlement: 'Entitlement',
                actor: 'Actor',
                status: 'Status',
                timestamp: 'Timestamp',
              },
              filters: {
                allEvents: 'All events',
                allGroups: 'All groups',
                allStatuses: 'All statuses',
                accepted: 'Accepted',
                clear: 'Clear filters',
                eventFilterLabel: 'Filter by event',
                groupFilterLabel: 'Filter by group',
                read: 'Read',
                rejected: 'Rejected',
                resultsCount_one: '{{count}} result',
                resultsCount_other: '{{count}} results',
                statusFilterLabel: 'Filter by status',
                warning: 'Warning',
              },
            },
            detail: {
              eventId: 'Event ID',
              status: 'Status',
              timestamp: 'Timestamp',
              instance: 'Instance',
              actor: 'Actor',
              eventName: 'Event Name',
              entitlement: 'Entitlement',
              fullPayload: 'Full Payload',
            },
            howItWorks: {
              title: 'How Audit Trail Works',
              items: {
                entitlementRead: {
                  title: 'Entitlement Read',
                  description:
                    'Every time a client reads an entitlement value through the Data Plan API, an event is recorded with the current value.',
                },
                usageAccepted: {
                  title: 'Usage Accepted',
                  description:
                    'When a client reports usage and the new total stays within the configured threshold, the report is accepted.',
                },
                usageRejected: {
                  title: 'Usage Rejected',
                  description:
                    'If reported usage would exceed the configured threshold, the operation is rejected and the usage is not persisted.',
                },
              },
            },
          },
        },
      },
    },
    Catalog: {
      title: 'Catalog',
    },
    Licenses: {
      title: 'Licenses',
      subtitle: 'Manage licenses and entitlement limits',
      Public: {
        label: 'Public catalog',
        switchLabel: 'List {{name}} in the public catalog',
        badge: 'Public',
        listed: 'The license is listed in the public catalog',
        unlisted: 'The license is no longer listed in the public catalog',
      },
      FallbackWarning: {
        ending:
          'This license is public and has a paid version, but names no fallback. When a subscription to it ends, the instance keeps a paid version of the license without being billed.',
        anonymousCheckout:
          'It also cannot be sold through an anonymous checkout with an amount due today: that checkout is refused until the license names a fallback.',
        chooseInSettings:
          'Choose a free license to fall back to in the settings of the license.',
        chooseInField:
          'Choose a free license to fall back to in the field above.',
      },
      FamilySettings: {
        link: 'Settings',
        linkLabel: 'Settings of {{name}}',
        dialogTitle: 'License settings',
        dialogDescription:
          'How {{name}} behaves when a subscription to it ends or a trial of it is about to end. These settings apply to every version of the license.',
        save: 'Save settings',
        noFallback: 'No fallback',
        Labels: {
          fallback: 'When a subscription ends, fall back to',
          trialEnd: 'A trial that ends without a payment method',
          trialReminder: 'Trial reminder (days before the end)',
        },
        Descriptions: {
          fallback:
            'Another license of the organization whose every version is free. When a subscription to this license ends, the instance moves to the default published version of that license.',
          trialEnd:
            'What a trial that is charged automatically, for a total above 0, becomes at its end when the customer has no active payment method. If it is canceled, the subscription is canceled. If it is converted, the subscription becomes active, and its first charge then fails.',
          trialReminder:
            'How many days before a trial ends it announces its end, from 1 to 30. The default is 3. A trial no longer than that announces it at once. It applies to the trials that start after the change: a trial already running keeps the lead it started with.',
        },
        TrialEnd: {
          CANCEL: 'Cancel it',
          CONVERT: 'Convert it to an active subscription',
        },
        Errors: {
          trialReminderDays: 'Enter a whole number of days from 1 to 30',
        },
        Refusals: {
          invalidFallback:
            'Choose another license whose every version is free, or no fallback.',
          invalidTrialEnd:
            'Choose what a trial becomes at its end: cancel it or convert it.',
        },
        Toasts: {
          updated: 'The license settings were saved',
        },
      },
      Freeze: {
        billed: {
          title: 'This version is billed',
          description:
            'A live subscription bills this version, so its entitlements and prices are frozen: changing them would change a contract already sold. Create a new version to change what is sold. It starts from this version’s entitlements and prices, as a draft you can change, and subscriptions stay on this version until they move to the new one.',
        },
        published: {
          title: 'The prices of a published version are immutable',
          description:
            'Deprecate a price to retire it, or create a new version to change what is sold. The new version starts from this version’s entitlements and prices, as a draft you can change.',
        },
        archived: {
          title: 'This version takes no new price',
          description:
            'A version withdrawn from sale takes no new price. Create a new version to change what is sold. It starts from this version’s entitlements and prices, as a draft you can change.',
        },
        createNewVersion: 'Create a new version',
      },
      PriceCopy: {
        title: 'The copy of prices stopped',
        description:
          'The prices of {{name}} v{{version}} were being copied to this version, and {{copied}} of {{total}} are in. The rest can be copied from where it stopped. Nothing was deleted, and nothing was changed on {{name}} v{{version}}.',
        copiedHeading: 'Copied',
        pendingHeading: 'Still to copy',
        resume: 'Resume the copy',
        Toasts: {
          done: 'Prices copied',
        },
      },
      Commercial: {
        cardTitle: 'Commercial terms',
        cardDescription: 'How this version is sold.',
        dialogTitle: 'Edit commercial terms',
        dialogDescription:
          'How {{name}}, version {{version}}, is sold. Nothing else about the version changes.',
        Fields: {
          pricingType: 'Pricing type',
          trial: 'Free trial',
          paymentMethod: 'Payment method',
          ctaUrl: 'Call-to-action URL',
        },
        PricingTypes: {
          FREE: 'Free',
          PAID: 'Paid',
          CUSTOM: 'Custom',
        },
        Values: {
          noTrial: 'No trial',
          trialDays_one: '{{count}} day',
          trialDays_other: '{{count}} days',
          paymentRequired: 'Captured at sign-up',
          paymentNotRequired: 'Not required',
        },
        Form: {
          save: 'Save',
          Labels: {
            pricingType: 'Pricing type',
            trial: 'Trial length (days)',
            paymentMethod: 'Require a payment method at sign-up',
            ctaUrl: 'Call-to-action URL',
          },
          Descriptions: {
            pricingType:
              'Free and paid versions can be bought self-serve; a custom one sends a buyer to the call-to-action URL or to a conversation.',
            trial:
              'A subscription to this version starts with this trial. Leave empty for no trial.',
            paymentMethod:
              'Self-serve sign-up captures a payment method before it activates.',
            ctaUrl:
              'Where a buyer is sent when this version cannot be bought self-serve: an http or https URL of at most 2,048 characters. Leave empty for none.',
          },
          Placeholders: {
            trial: '14',
            ctaUrl: 'https://acme.test/contact',
          },
          Errors: {
            trialMin: 'Must be at least 1',
            trialMax: 'Must be 365 or less',
            trialWhole: 'Enter a whole number of days',
            urlScheme: 'Enter an http or https URL',
            urlLength: 'At most 2,048 characters',
          },
        },
        Toasts: {
          updated: 'Commercial terms updated',
        },
      },
      Prices: {
        title: 'Prices',
        tabDescription:
          'One price is one billable concern, and becomes one line of an invoice.',
        defaultBadge: 'Default',
        deprecatedOn: 'Deprecated {{date}}',
        Summary: {
          empty: 'No active price yet',
          or: 'or',
          overage: '{{price}} above the allowance',
        },
        Notes: {
          draft:
            'The prices of a draft can be edited. Once the version is published they become immutable: deprecate one, or create a new version to change what is sold.',
          published:
            'The prices of a published version are immutable. Deprecate a price to retire it, or create a new version to change what is sold. A price can still be added until a subscription bills this version.',
          archived:
            'This version is withdrawn from sale. Its prices are immutable and it takes no new price; subscriptions that bill it keep being billed.',
        },
        Actions: {
          add: 'Add price',
          edit: 'Edit',
          editAria: 'Edit {{label}}',
          deprecate: 'Deprecate',
          deprecateAria: 'Deprecate {{label}}',
        },
        Drawer: {
          titleNew: 'New price',
          titleEdit: 'Edit price',
          description:
            '{{name}}, version {{version}}. A price becomes one line of an invoice.',
          create: 'Create price',
          update: 'Save price',
        },
        Form: {
          Labels: {
            model: 'Shape',
            timing: 'Billing timing',
            period: 'Billing period',
            currency: 'Currency',
            label: 'Label on the invoice',
            amount: 'Amount',
            amountPer: 'Amount per {{unit}}',
            isDefault: 'Default price of this period',
          },
          Descriptions: {
            modelLocked:
              'The shape of a price cannot change once it exists. Deprecate it and add another to change it.',
            timingLocked:
              'A metered price is always billed in arrears: usage cannot be billed before it happens.',
            period: 'How often the fee is billed.',
            currency:
              'A version bills in one currency, fixed by its first price.',
            currencyLocked:
              'This version bills in {{currency}}, fixed by its first price.',
            label:
              'The name of the invoice line. Left empty, Kaiten derives one.',
            amountFlat:
              'Billed once per period. Type the amount in the currency’s own unit (for example 49.00).',
            amountUsage:
              'Applied from the first unit. Type the amount in the currency’s own unit (for example 0.075).',
            amountOverage:
              'Applied only to the units above the limit. Type the amount in the currency’s own unit (for example 0.075).',
            isDefault:
              'The price the catalog and the invoice preview use for this billing period. A period has one.',
          },
          Placeholders: {
            amount: '0.00',
            currency: 'Select a currency',
            currencySearch: 'Search a currency',
            label: 'Pro, monthly',
          },
          livePreview: 'Reads as {{price}}',
          Errors: {
            label: 'The label is at most 200 characters.',
            currency: 'Pick a currency Kaiten supports.',
            amount:
              'Enter a valid amount: zero or more, with at most 12 decimals past the currency’s own and 12 digits in its smallest unit.',
            meter: 'Pick the entitlement this price measures.',
            period: 'Pick the billing period.',
          },
        },
        Deprecate: {
          PlanChangeTarget: {
            looking: 'Looking for the instances concerned…',
            instances:
              'These instances are scheduled to move to this price. Cancel the change on the Billing tab of each one, then deprecate the price:',
            moves: '({{customer}}, from {{date}})',
          },
          title: 'Deprecate “{{label}}”?',
          descriptionFlat:
            'Subscriptions already pinned to this price keep being billed from it. It is no longer offered to new subscriptions, nor as the target of a plan change. This cannot be undone.',
          descriptionMetered:
            'This price produces no line from the next invoice on, and it is no longer offered. What it already billed is unchanged. This cannot be undone.',
          defaultNote:
            'It is the default price of its period: deprecating it clears the default flag in the same write.',
          confirm: 'Deprecate',
        },
        Toasts: {
          created: 'Price created',
          updated: 'Price updated',
          deprecated: 'Price deprecated',
        },
        Preview: {
          open: 'Preview invoice',
          unavailable:
            'Add an active flat fee first: an invoice always starts from one.',
          title: 'Preview an invoice',
          description:
            'What a subscription to {{name}}, version {{version}}, would be billed at its next renewal. Nothing is created.',
          hint: 'Run the preview to see the invoice.',
          run: 'Run preview',
          addAddOn: 'Add an add-on',
          removeAddOn: 'Remove add-on {{position}}',
          Labels: {
            base: 'Base price',
            samples: 'Sample usage',
            usage: 'Usage',
            instance: 'Instance',
            addOns: 'Add-ons',
            addOn: 'Add-on',
            addOnQuantity: 'Units',
            voucher: 'Promo code',
          },
          Source: {
            samples: 'Samples',
            samplesDetail: 'Type what each entitlement used.',
            instance: 'An instance',
            instanceDetail:
              'Its own usage since its current billing period began.',
          },
          Descriptions: {
            base: 'The flat fee the invoice starts from.',
            samples:
              'What each entitlement used over the period that ends, in its own units. Leave a field empty for no usage.',
            instance:
              'The usage it made over its current billing period, or over the last one if it has no subscription, is rated.',
            addOns:
              'Their fees for the period of the base and their metered prices are priced in, and what they grant raises the limit a sample is rated against.',
            voucher:
              'The discount of an active promo code, applied as a redemption would be. Nothing is redeemed.',
          },
          Placeholders: {
            quantity: '0',
            instance: 'Choose an instance',
            instanceLoading: 'Loading the instances',
            instanceSearch: 'Search an instance',
            addOn: 'Choose an add-on',
            addOnSearch: 'Search an add-on',
            voucher: 'LAUNCH-2027',
          },
          Errors: {
            quantity:
              'Enter a quantity: zero or more, with a point for decimals.',
            instance: 'Choose the instance to rate.',
            addon: 'Choose an add-on.',
            addonQuantity: 'Enter a whole number of units, one or more.',
            outsideRetention:
              'The usage before {{date}} is no longer kept, and the period of this instance began earlier.',
          },
        },
        Table: {
          Columns: {
            price: 'Price',
            shape: 'Shape',
            meter: 'Meters',
            amount: 'Amount',
            billed: 'Billed',
            status: 'Status',
          },
          empty: 'This version has no price yet.',
        },
      },
      Table: {
        Columns: {
          name: 'Name',
          version: 'Version',
          isActive: 'Active',
          description: 'Description',
          type: 'Type',
          features: 'Features',
        },
        warningDelete:
          'Some instances are still associated with this license.\nYou need to update their license first to ensure no instance remains linked to the current license.',
      },
      Mutation: {
        titleNew: 'New License',
        titleUpdate: 'Edit License',
        licenseNotFound: 'License not found',
        Form: {
          mainTitle: 'Main Information',
          mainDescription:
            'Name, type, version name. Then add entitlement declarations below.',
          Labels: {
            name: 'Name',
            description: 'Description',
            type: 'Type',
            versionName: 'Version Name',
            slug: 'Slug',
            features: 'Features',
            createAsDraft: 'Save as draft',
          },
          Types: {
            Trial: 'Trial',
            Development: 'Development',
            Paid: 'Paid',
            Community: 'Community',
          },
          Placeholders: {
            name: 'Bronze',
            description: 'Limited features',
            type: 'Select a license type',
            versionName: 'Version Name',
            slug: 'bronze-license',
          },
          Descriptions: {
            features: 'Features available in this license',
            slug: 'Auto-generated — edit to set a custom one.',
            createAsDraft:
              'A draft is not on sale yet: it cannot be set as the default version, and the license does not serve it until you publish it. You can still assign it to an instance to try it out.',
          },
          Errors: {
            name: 'Name is required',
            savedAsDraft: 'Saved as a draft, not published: {{reason}}',
          },
          createSuccess: 'License created successfully',
          updateSuccess: 'License updated successfully',
          createButton: 'Create License',
          updateButton: 'Update License',
        },
      },
      Version: {
        titleNew: 'New Version',
        titleNewOf: 'New version of {{name}}',
        description: 'Create a new version of this license',
        createButton: 'Create Version',
        newVersionButton: 'New Version',
        Form: {
          description:
            'Select a license name, then the existing version to use as base. Type is inherited from the base license.',
          baseLicense: 'Base License',
          selectLicense: 'Select a license name to create a version for',
          Labels: {
            licenseName: 'License name',
            versionName: 'Version name',
            baseVersion: 'Base version (existing)',
            copyPrices: 'Copy the prices of the base version',
          },
          Descriptions: {
            copyPrices:
              'Each active price of the base version is added to the new one, in the same order, once its entitlements are. Subscriptions stay on their version until each one is scheduled onto the new one.',
          },
          Placeholders: {
            selectLicenseName: 'Select license name',
            selectBaseVersion: 'Select base version',
            versionName: 'e.g. Dev',
          },
          entitlementsDescription:
            'Entitlements attached to this license, their threshold (limit) and overage allowance. For NUMBER type, threshold is the max value; use Unlimited or leave empty for no cap. The overage allowance is the percentage a capped threshold may be exceeded by before usage is rejected: 0 makes it a hard limit. When you change the base version, entitlements are filled from that version. Use Reset to clear them.',
          Errors: {
            baseLicenseRequired: 'Base license is required',
            licenseNameRequired: 'License name is required',
            versionNameRequired: 'Version name is required',
            baseLicenseNotFound: 'Selected license not found',
          },
          typeInherited:
            'Type is inherited from the base license and cannot be changed',
        },
      },
      List: {
        licenseName: 'License name',
        unknownVersion: 'Unknown version',
        versionName: 'Version name',
        versionCount: '{{count}} version',
        versionCount_other: '{{count}} versions',
        defaultBadge: 'Default: {{version}}',
      },
      Lifecycle: {
        DRAFT: 'Draft',
        PUBLISHED: 'Published',
        ARCHIVED: 'Archived',
      },
      LifecycleActions: {
        publish: {
          label: 'Publish',
          title: 'Publish {{name}} v{{version}}?',
          description:
            'The version goes on sale and can be set as the default. A license without a default version serves its newest published one, which may be this one.',
          confirm: 'Publish',
          success: 'Version published',
          Billing: {
            prices:
              'Its prices become immutable: from then on they can only be deprecated.',
            grants:
              'Its entitlements are frozen as soon as a subscription bills this version.',
            others:
              'Subscriptions on other versions are not affected, and nothing is archived.',
          },
        },
        archive: {
          label: 'Archive',
          title: 'Archive {{name}} v{{version}}?',
          description:
            'The version is withdrawn from sale: the license stops serving it and it can no longer be assigned to an instance. Instances already on it keep it. You can unarchive it later.',
          confirm: 'Archive',
          success: 'Version archived',
        },
        unarchive: {
          label: 'Unarchive',
          title: 'Unarchive {{name}} v{{version}}?',
          description:
            'The version goes back on sale: it can be assigned to instances and set as the default again. A license without a default version serves its newest published one, which may be this one.',
          confirm: 'Unarchive',
          success: 'Version unarchived',
        },
        archiveDefaultUnavailable:
          'The default version cannot be archived. Set another version as the default, or unset the default, first.',
      },
      DefaultActions: {
        unset: 'Unset default',
        setSuccess: 'Default version updated',
        unsetSuccess: 'Default version unset',
      },
      DeleteDraft: {
        label: 'Delete',
        title: 'Delete the draft {{name}} v{{version}}?',
        description:
          'The draft and the entitlements it grants are deleted. It was never on sale, so no customer loses it. An instance still on it prevents the deletion.',
        descriptionBilling:
          'The draft, its prices and the entitlements it grants are deleted. It was never on sale, so no customer loses it. An instance still on it prevents the deletion.',
        confirm: 'Delete',
        success: 'Draft deleted',
      },
      VersionsTable: {
        Columns: {
          versionName: 'Version name',
          version: 'Version',
          type: 'Type',
          lifecycleState: 'State',
          pricingType: 'Pricing',
          default: 'Default',
          instances: 'Instances',
          actions: 'Actions',
        },
        default: 'Default',
        setAsDefault: 'Set as default',
        setDefaultUnavailable:
          'Only a published version can be set as the default',
      },
      Detail: {
        Tabs: {
          overview: 'Overview',
        },
        cardTitle: 'License details',
        cardDescription:
          'Name, type, version. Entitlements and limits are managed below.',
        defaultBadge: 'Default version',
        setDefaultButton: 'Set as default version',
        setDefaultUnavailable:
          'Only a published version can be set as the default',
        Fields: {
          name: 'Name',
          type: 'Type',
          lifecycleState: 'State',
          version: 'Version',
          description: 'Description',
        },
        Toasts: {
          addEntitlementSuccess: 'Entitlement added successfully',
          addEntitlementError: 'Error adding entitlement',
          updateEntitlementSuccess: 'Entitlement limit updated successfully',
          updateEntitlementError: 'Error updating entitlement limit',
          removeEntitlementSuccess: 'Entitlement removed successfully',
          removeEntitlementError: 'Error removing entitlement',
        },
      },
      Entitlements: {
        cardTitle: 'Entitlements & limits',
        cardDescription:
          'Entitlements attached to this license, their threshold (limit) and overage allowance. For NUMBER type, threshold is the max value; use Unlimited or leave empty for no cap. The overage allowance is the percentage a capped threshold may be exceeded by before usage is rejected: 0 makes it a hard limit.',
        emptyMessage:
          'No entitlements attached. Click "Add entitlement" to add one.',
        addButton: 'Add entitlement',
        resetButton: 'Reset',
        removeAction: 'Remove',
        removeAriaLabel: 'Remove {{name}}',
        confirmRemoveTitle: 'Remove {{name}} from this license?',
        confirmRemoveDescription:
          'Instances on this license lose this entitlement until it is added back.',
        Columns: {
          entitlement: 'Entitlement',
          type: 'Type',
          threshold: 'Threshold / limit',
          overagePercent: 'Overage allowance',
          actions: 'Actions',
        },
        Dialog: {
          title: 'Add entitlement',
          description: 'Attach a new entitlement to this license.',
          entitlementLabel: 'Entitlement',
          entitlementPlaceholder: 'Select an entitlement',
          thresholdLabel: 'Threshold / limit',
          thresholdPlaceholder: 'e.g. 1000',
          overagePercentLabel: 'Overage allowance (%)',
          overagePercentPlaceholder: 'e.g. 10',
          maximumAllowedUsage:
            'Usage is accepted up to {{max}} before being rejected.',
          overagePercentDescription:
            'Percentage the threshold may be exceeded by before usage is rejected, from 0 to 100. Zero is a hard limit.',
          booleanLabel: 'Value',
          booleanEnabled: 'Enabled',
          booleanDisabled: 'Disabled',
          configLabel: 'Configuration (JSON)',
          cancelButton: 'Cancel',
          addButton: 'Add',
        },
        saveButton: 'Save',
        cancelButton: 'Cancel',
        thresholdPlaceholder: 'e.g. 1000 or Unlimited',
        inlineEditHint: 'Enter to save · Esc to cancel',
        overageNeedsLimit:
          'Set a limit first: an unlimited grant has nothing to exceed.',
        allAttachedHint:
          'Every entitlement in the catalog is already attached to this license.',
        thresholdError: 'Threshold must be an integer or Unlimited',
        configError: 'Configuration must be valid JSON',
        overagePercentPlaceholder: 'e.g. 10',
        overagePercentError:
          'Overage allowance must be a whole percentage greater than or equal to 0',
        Status: {
          enabled: 'Enabled',
          disabled: 'Disabled',
          unlimited: 'Unlimited',
          configured: 'Configured',
          hardLimit: 'Hard limit',
          softLimit: '+{{percent}}% overage',
        },
      },
    },
    Releases: {
      title: 'Releases',
      titleManagement: 'Release Management',
      subtitle:
        'Manage releases, components, deployment zones, and deployments across all environments',
      tabs: {
        releases: 'Releases',
        components: 'Components',
        deploymentZones: 'Deployment Zones',
        deployments: 'Deployments',
      },
      Form: {
        createRelease: 'Create Release',
        createZone: 'Create Deployment Zone',
      },
      Releases: {
        title: 'Releases',
        subtitle:
          'Browse the full historical view of releases, components, zones, and linked instances',
        Table: {
          Columns: {
            components: 'Components',
            instances: 'Instances',
          },
          empty: 'No releases yet. Create one to get started.',
          componentCount_one: '{{count}} component',
          componentCount_other: '{{count}} components',
          instanceCount_one: '{{count}} instance',
          instanceCount_other: '{{count}} instances',
          zoneCount_one: '{{count}} zone',
          zoneCount_other: '{{count}} zones',
        },
        Dialogs: {
          componentsTitle: 'Components in this release',
          componentsDescription:
            'Versioned components included in this release snapshot.',
          instancesTitle: 'Instances linked to this release',
          instancesDescription:
            'Current instances running in deployment zones where this release has been deployed.',
          Columns: {
            customer: 'Customer',
            deploymentZone: 'Deployment zone',
            instance: 'Instance',
          },
        },
      },
      Detail: {
        actions: {
          deploy: 'Deploy',
        },
        fallback: {
          noDescription: 'No description provided.',
        },
        links: {
          openDeploymentZone: 'Open deployment zone',
        },
        stats: {
          deploymentZones: 'Deployment zones',
          productionZones: 'Production zones',
          lastDeployment: 'Last deployment update',
          never: 'Never',
        },
        tabs: {
          overview: 'Overview',
          deploymentZones: 'Deployment Zones',
        },
        Overview: {
          general: {
            title: 'General Information',
            description:
              'Core release metadata and immutable audit information.',
            fields: {
              version: 'Version',
              slug: 'Slug',
              id: 'ID',
              status: 'Status',
              description: 'Description',
            },
            audit: {
              createdAt: 'Created at',
              by: 'by',
            },
          },
          deployment: {
            title: 'Deployment Footprint',
            description:
              'Deployment coverage by zone type and relation shortcuts.',
            fields: {
              totalZones: 'Linked zones',
            },
            empty: 'No deployment zones are linked to this release yet.',
          },
          components: {
            title: 'Components',
            description: 'What this release ships, fixed when it was created.',
            columns: {
              name: 'Name',
              version: 'Version',
              description: 'Description',
            },
            empty: 'This release has no components.',
          },
        },
        DeploymentZones: {
          title: 'Linked Deployment Zones',
          description:
            'Zones currently linked to this release through active deployment.',
          emptyTitle: 'Not deployed anywhere yet',
          emptyDescription: 'Pick a deployment zone to run this release.',
          emptyCta: 'Deploy to a zone',
        },
      },
      Deployments: {
        title: 'Deployments',
        subtitle:
          'Operate current releases across deployment zones and create the next release version',
        Form: {
          title: 'Create Release',
          description:
            'Create a new release from scratch or from a previous release, then select, create, and update the components it should contain.',
          Steps: {
            base: 'Release base',
            metadata: 'Information',
            components: 'Components',
          },
          Buttons: {
            next: 'Next',
            back: 'Back',
          },
          steps: {
            base: {
              title: 'Choose a release base',
              description:
                'Start from scratch or inherit components from an existing release before preparing the new version.',
            },
            metadata: {
              title: 'Release information',
              description:
                'Define the version and description for this release.',
            },
            inherited: {
              title: 'Inherited components',
              description:
                'Review the components copied from the base release and update or remove them for this version.',
            },
            select: {
              title: 'Select existing components',
              description:
                'Attach existing components from the shared catalog to this release.',
            },
            add: {
              title: 'Create components',
              description:
                'Create any new components that should appear for the first time in this release.',
            },
          },
          modes: {
            scratch: {
              title: 'Start from scratch',
              description:
                'Create a release with no inherited components. You can then select existing components or create new ones in the next steps.',
            },
            existing: {
              title: 'Use existing release',
              description:
                'Start from a previous release, review its inherited components, add existing catalog components, and create new ones if needed.',
            },
          },
          previousRelease: 'Previous release',
          selectPreviousRelease: 'Select a base release',
          clearPreviousRelease: 'Clear base release',
          changeBaseDialog: {
            title: 'Reset component changes?',
            description:
              'Changing the release base will remove the current component selections, edits, and new components. Release metadata will be kept.',
            confirm: 'Reset changes',
          },
          inheritedComponentsTitle: 'Inherited components',
          inheritedComponentsDescription: 'Components copied from {{version}}.',
          noPreviousReleaseSelected:
            'Choose a previous release to inherit its components, or start from an empty release.',
          noInheritedComponents:
            'This base release does not contain any components yet.',
          selectComponentsTitle: 'Available components',
          selectComponentsDescription:
            'Pick existing components from the shared catalog to include in this release.',
          selectedComponentsCount_one: '{{count}} selected',
          selectedComponentsCount_other: '{{count}} selected',
          noAvailableComponents:
            'No standalone components are available yet. Create one in the next step if needed.',
          noMatchingComponents: 'No components match this search.',
          searchComponentsPlaceholder: 'Search components...',
          editComponent: 'Edit',
          deleteComponent: 'Delete',
          revertComponent: 'Revert',
          componentRemoved:
            'This component will be removed from the new release.',
          addComponentsTitle: 'New components',
          addComponentsDescription:
            'Create any components that first appear in this release.',
          addComponentDescription:
            'Define the metadata for a component created from this release wizard.',
          addComponent: 'Add component',
          noAddedComponents:
            'No new components yet. Add one if this release should create a new component.',
          newComponentLabel: 'New component {{index}}',
          statuses: {
            edited: 'Edited',
            removed: 'Removed',
          },
          componentPatchesTitle: 'Component patches',
          componentPatchesDescription:
            'Add, update, or remove components on top of the inherited release snapshot.',
          componentPatchesAddOnly:
            'Without a previous release, only add patches are available.',
          addPatch: 'Add patch',
          noComponentPatches:
            'No component patches yet. Add one if this release changes the component catalog.',
          patchLabel: 'Patch {{index}}',
          operation: 'Operation',
          component: 'Component',
          selectComponent: 'Select a component',
          componentSlug: 'Component slug',
          componentNamePlaceholder: 'API Gateway',
          operations: {
            add: 'Add component',
            update: 'Update component',
            remove: 'Remove component',
          },
          basedOn: 'Based on {{version}}',
          Columns: {
            name: 'Name',
            version: 'Version',
            source: 'Source',
            actions: 'Actions',
          },
          sources: {
            new: 'New',
            catalog: 'Catalog',
            inherited: 'Inherited',
          },
          componentsCard: {
            title: 'Components',
            description: 'Manage the components included in this release.',
            addFromCatalog: 'Add from catalog',
            createNew: 'Create new',
            emptyMessage:
              'No components yet. Add from catalog or create a new one.',
            missingSlug:
              'This component has no slug yet; refresh the catalog or recreate it.',
          },
          addCatalogDialog: {
            title: 'Add components from catalog',
            description:
              'Select existing components to include in this release.',
            addButton_one: 'Add {{count}} component',
            addButton_other: 'Add {{count}} components',
          },
          createComponentDialog: {
            title: 'Create a new component',
            description:
              'Define a component that will be created with this release.',
            namePlaceholder: 'API Gateway',
            createButton: 'Create component',
          },
        },
      },
      Components: {
        title: 'Components',
        subtitle:
          'Browse and create versioned components across your platform, including those linked to releases',
        Actions: {
          create: 'Create Component',
        },
        Stats: {
          totalComponents: 'Total Components',
          releasesUsingComponents: 'Releases Using Components',
          sharedAcrossReleases: 'Shared Across Releases',
          versionedComponents: 'Versioned Components',
        },
        Form: {
          titleCreate: 'Create Component',
          titleEdit: 'Edit Component',
          Labels: {
            name: 'Name',
            version: 'Version',
            slug: 'Slug',
            description: 'Description',
          },
          Placeholders: {
            name: 'API Gateway',
            version: 'v1.2.3',
            slug: 'api-gateway',
            description:
              'Routes tenant traffic to the public REST and GraphQL APIs',
          },
          Descriptions: {
            name: 'Human-readable component name.',
            version: 'Version displayed in the catalog and release flows.',
            slug: 'Auto-generated — edit to set a custom one.',
            description: 'Optional context shown in the catalog.',
          },
          Errors: {
            nameRequired: 'Name is required',
            versionRequired: 'Version is required',
          },
        },
        Table: {
          Columns: {
            name: 'Name',
            version: 'Version',
            releases: 'Releases',
            createdAt: 'Created',
            createdBy: 'Created by',
          },
          releaseCount_one: '{{count}} release',
          releaseCount_other: '{{count}} releases',
          versionCount_one: '{{count}} version',
          versionCount_other: '{{count}} versions',
          versionsOf: 'Versions of {{name}}',
          empty: 'No components yet. Create one to get started.',
        },
        Dialog: {
          title: 'Releases for {{name}}',
          description: 'List of all releases that include this component',
          Columns: {
            release: 'Release',
            status: 'Status',
            created: 'Created',
          },
        },
        fallback: {},
        Success: {
          created: 'Component created successfully',
          updated: 'Component updated successfully',
        },
      },
      DeploymentZones: {
        title: 'Deployment Zones',
        subtitle:
          'Manage the environments where releases are staged and deployed',
        Table: {
          releaseCount_one: '{{count}} release',
          releaseCount_other: '{{count}} releases',
          instanceCount_one: '{{count}} instance',
          instanceCount_other: '{{count}} instances',
        },
        Dialogs: {
          releasesTitle: 'Release history for this zone',
          releasesDescription:
            'Historical releases deployed to this deployment zone.',
          instancesTitle: 'Instances in this zone',
          instancesDescription:
            'Current instances linked to this deployment zone.',
        },
        Detail: {
          fallback: {
            noDescription: 'No description provided.',
          },
          links: {
            openZone: 'Open zone',
          },
          stats: {
            type: 'Type',
            currentRelease: 'Current release',
            metadataKeys: 'Metadata keys',
            sharedReleaseZones: 'Zones sharing current release',
          },
          status: {
            deployed: 'Deployed',
            notDeployed: 'Not deployed',
          },
          tabs: {
            overview: 'Overview',
            peers: 'Peers',
          },
          Overview: {
            general: {
              title: 'General Information',
              description:
                'Deployment zone identity and immutable audit trail.',
              fields: {
                slug: 'Slug',
                id: 'ID',
              },
              audit: {
                createdAt: 'Created at',
                updatedAt: 'Updated at',
                by: 'by',
              },
            },
            release: {
              title: 'Current Release',
              description:
                'Release currently associated with this deployment zone.',
            },
            features: {
              title: 'Features metadata',
              empty: 'No features metadata configured for this zone.',
            },
          },
          Peers: {
            title: 'Peer Zones',
            description:
              'Other deployment zones currently sharing the same release.',
            empty: 'No other deployment zones share this release.',
            notDeployedTitle: 'No Peers',
            notDeployedDescription:
              'This zone has no linked release yet, so no peer zones can be computed.',
          },
        },
      },
    },
    EntitlementGroups: {
      Mutation: {
        titleNew: 'New Entitlement Group',
        Form: {
          inlineDescription:
            'Create a new group and immediately associate it with this entitlement.',
          Labels: {
            name: 'Name',
            description: 'Description',
          },
          Placeholders: {
            name: 'Usage quotas',
            description: 'Optional description',
          },
          Descriptions: {
            name: 'The display name used in entitlement filters',
            description: 'Optional context for admins',
          },
          createButton: 'Create Group',
          updateButton: 'Update Group',
        },
      },
    },
    Entitlements: {
      title: 'Entitlements',
      subtitle: 'Features and limits your licenses grant',
      Table: {
        Columns: {
          name: 'Name',
          description: 'Description',
          groups: 'Groups',
          type: 'Type',
          aggregationMethod: 'Aggregation Method',
        },
      },
      Delete: {
        checkingLicenses: 'Checking which licenses grant this entitlement…',
        grantedByLicenses_one:
          'This entitlement is granted by {{count}} license. Remove it from that license before deleting it.',
        grantedByLicenses_other:
          'This entitlement is granted by {{count}} licenses. Remove it from those licenses before deleting it.',
      },
      Mutation: {
        titleNew: 'New Entitlement',
        titleUpdate: 'Edit Entitlement',
        deleteSuccess: 'Entitlement deleted successfully',
        Form: {
          mainTitle: 'Main Information',
          Labels: {
            name: 'Name',
            slug: 'Slug',
            description: 'Description',
            groups: 'Groups',
            type: 'Type',
            aggregationMethod: 'Aggregation Method',
            icon: 'Icon',
            userFacing: 'User facing',
            displayOrder: 'Display order',
            units: 'Units',
            unitSingular: 'Unit (singular)',
            unitPlural: 'Unit (plural)',
            saleUnitsToggle: 'Feature is sold in different units',
            saleUnitSingular: 'Sale unit (singular)',
            saleUnitPlural: 'Sale unit (plural)',
            saleUnitFactor: 'Calculation',
            saleUnitFactorOne: 'One sale unit',
            saleUnitFactorValue: 'Base units per sale unit',
            resetPeriod: 'Usage resets',
            resetAnchor: 'Window aligned on',
          },
          Placeholders: {
            name: 'Entitlement name',
            slug: 'api-calls',
            description: 'Entitlement description',
            groups: 'Search or create groups',
            groupSearch: 'Search groups',
            type: 'Select a type',
            aggregationMethod: 'Select an aggregation method',
            displayOrder: '0',
            unitSingular: 'seat',
            unitPlural: 'seats',
            saleUnitSingular: 'pack',
            saleUnitPlural: 'packs',
            saleUnitFactor: '3',
            resetPeriod: 'Select a reset cadence',
            resetAnchor: 'Select a window alignment',
          },
          Descriptions: {
            name: 'The name of the entitlement',
            slugGenerated:
              'Optional. Left empty, it is built from the name (lowercase, words joined by hyphens) followed by 6 random characters, e.g. "{{example}}". It can\'t be changed afterwards.',
            slugSet:
              "Used as it is: lowercase letters, digits and hyphens (2 to 100 characters), unique in your organization. It can't be changed afterwards.",
            slugLocked:
              "Set when the entitlement was created. It can't be changed.",
            description:
              'A detailed description of what this entitlement provides',
            groups:
              'Associate this entitlement with one or more groups for filtering and reporting.',
            type: 'The type of entitlement (Boolean or Number)',
            aggregationMethod: 'How multiple usage events are combined',
            icon: 'Pick an icon to represent this entitlement',
            userFacing:
              'Display this entitlement in customer-facing components such as plan and pricing pages',
            displayOrder:
              'Sort order in customer-facing components (lower values appear first)',
            resetPeriod:
              'How often the usage counter goes back to zero. A lifetime counter never resets, and the cadence and its alignment can be set once but never changed.',
            resetPeriodLocked:
              'The reset cadence is fixed once set: stored usage would become impossible to interpret if it changed.',
            resetAnchor:
              "Calendar windows start on UTC calendar boundaries. License start windows are phased off each instance's own license start date. Billing date windows are phased off the billing anchor of the instance's subscription, and off the license start date for an instance without one. They need a monthly or yearly cadence.",
            resetAnchorLocked:
              'The alignment is fixed with the cadence once set: usage already counted belongs to windows that another alignment would cut differently.',
            resetPeriodLatest:
              'The Latest aggregation keeps only the most recent value, so it cannot be combined with a reset period.',
          },
          Icon: {
            trigger: 'Choose icon',
            search: 'Search icons…',
            empty: 'No icons found',
            clear: 'Remove icon',
          },
          Actions: {
            createGroup: 'Create "{{name}}"',
            creatingGroup: 'Creating "{{name}}"',
            removeGroup: 'Remove group {{name}}',
          },
          Empty: {
            noGroupsSelected: 'No groups selected yet',
            noGroupResults: 'No matching groups',
          },
          Units: {
            fallbackSingular: 'unit',
            fallbackPlural: 'units',
          },
          Errors: {
            name: 'Name is required',
            slug: 'Use lowercase letters, digits and hyphens only (2 to 100 characters), with no hyphen at the start or end',
            unitPair: 'Provide both the singular and plural unit labels',
            saleUnitTrio:
              'Provide the sale unit labels and the conversion factor together',
            saleUnitRequiresBase:
              'Sale units require the base unit labels to be set',
            saleUnitFactor: 'The conversion factor must be greater than 0',
            unitLabelTooLong: 'Unit labels must be at most 100 characters',
            displayOrder: 'Enter a whole number',
            resetAnchorCadence:
              'The billing date needs a monthly or yearly cadence. Choose another alignment or another cadence.',
          },
          Refusals: {
            immutableResetAnchor:
              'The alignment of the usage windows was set once and cannot be changed. Close the form and open the entitlement again to see what it holds now.',
            immutableResetPeriod:
              'The reset cadence was set once and can be neither changed nor removed. Close the form and open the entitlement again to see what it holds now.',
          },
          Notices: {
            resetAnchorBackToCalendar:
              'The alignment was set back to Calendar: the billing date needs a monthly or yearly cadence.',
          },
          Hints: {
            resetAnchorBillingPeriod:
              'With the billing date, windows follow the billing date of an instance with a live subscription, and the license start date otherwise. When the billing date changes, for instance when a trial converts, a customer subscribes again or a subscription is canceled, the current window closes early and the usage counts from zero in the next one.',
          },
          Steps: {
            identity: 'Entitlement information',
            type: 'Type configuration',
          },
          Recovery: {
            viewList: 'View the list',
          },
          createButton: 'Create Entitlement',
          updateButton: 'Update Entitlement',
          createSuccess: 'Entitlement created successfully',
          updateSuccess: 'Entitlement updated successfully',
        },
      },
      Detail: {
        active: 'Active',
        editName: 'Edit name',
        loading: 'Loading...',
        stats: {
          linkedLicenses: {
            label: 'Linked licenses',
            helper: 'Licenses containing this entitlement',
          },
          licenseAlerts: {
            label: 'License alerts',
            near: 'Near limit',
            over: 'Over limit',
            ratio: '{{percent}}% of linked licenses',
          },
          unlimitedMappings: {
            label: 'Unlimited mappings',
            helper: 'Linked licenses with no limit',
          },
          impactScope: {
            label: 'Impact scope',
            customers_one: 'impacted customer',
            customers_other: 'impacted customers',
            atRisk_one: 'at-risk instance',
            atRisk_other: 'at-risk instances',
          },
        },
        Customers: {
          coverageTable: {
            title: 'Coverage by Customer',
            description:
              'Per-customer impact, alerts and maximum observed saturation.',
            empty: 'No customer coverage data for this entitlement.',
            columns: {
              customer: 'Customer',
              impactedInstances: 'Impacted instances',
              near: 'Near',
              over: 'Over',
              maxUsage: 'Max usage',
              mostExposedLicense: 'Most exposed license',
            },
          },
        },
        Usage: {
          noCaps:
            'No linked license caps this entitlement, so there is no saturation to measure yet.',
          saturationBuckets: {
            title: 'Saturation Buckets',
            description:
              'Global distribution of instance saturation for this entitlement.',
          },
          topRiskLicenses: {
            title: 'Top At-risk Licenses',
            description: 'Licenses ranked by highest observed usage ratio.',
            empty: 'No at-risk licenses detected.',
            instances_one: 'impacted instance',
            instances_other: 'impacted instances',
          },
          atRiskInstances: {
            title: 'At-risk Instances',
            description:
              'Instances currently near or over threshold for this entitlement.',
            empty: 'No instances are currently near or over limit.',
            lifetime: 'Lifetime',
            unlimited: 'Unlimited',
            softLimitHint: '(+{{percent}}% overage)',
            softLimitDescription:
              'Soft limit: usage is accepted up to {{max}} before being rejected.',
            columns: {
              instance: 'Instance',
              customer: 'Customer',
              license: 'License',
              usage: 'Usage',
              threshold: 'Threshold',
              currentPeriod: 'Current window',
              saturation: 'Saturation',
              status: 'Status',
            },
          },
        },
        buttons: {
          edit: 'Edit',
        },
        iconDialog: {
          title: 'Choose an icon',
          editLabel: 'Edit icon',
        },
        tabs: {
          overview: 'Overview',
          usage: 'Usage',
        },
        fallback: {
          unit: 'events',
          noDescription: 'No description provided.',
          notAvailable: 'n/a',
        },
        Overview: {
          general: {
            title: 'General Information',
            description:
              'Core entitlement metadata aligned with the schema contract.',
            fields: {
              name: 'Name',
              type: 'Type',
              aggregationMethod: 'Aggregation Method',
              resetPeriod: 'Usage resets',
              resetAnchor: 'Window aligned on',
              baseUnit: 'Base unit',
              saleUnit: 'Sale unit',
              calculation: 'Calculation',
              userFacing: 'User facing',
              groups: 'Groups',
              description: 'Description',
            },
            values: {
              visible: 'Visible',
              hidden: 'Hidden',
            },
            unitPair: '{{singular}} / {{plural}}',
            calculationFormula: '1 {{saleUnit}} = {{factor}} {{baseUnit}}',
            audit: {
              createdAt: 'Created at',
              updatedAt: 'Last update',
              by: 'by',
            },
          },
          licenses: {
            title: 'Linked licenses',
            description: 'What each license grants for this entitlement.',
            empty: 'No license grants this entitlement yet.',
            instances_one: 'instance',
            instances_other: 'instances',
            more_one: 'Show {{count}} more license',
            more_other: 'Show {{count}} more licenses',
          },
          contract: {
            title: 'Computation Contract',
            description:
              'How ingestion events are transformed into entitlement usage.',
            fields: {
              eventKey: 'Event key',
              unit: 'Unit',
              aggregationMethod: 'Aggregation',
            },
            formula: {
              title: 'Formula',
            },
          },
          payload: {
            title: 'API Payload Preview',
            description:
              'Snapshot of the schema fields used by create/update endpoints.',
          },
        },
      },
      EntitlementTypes: {
        BOOLEAN: 'Boolean',
        NUMBER: 'Number',
        CONFIG: 'Config',
        NUMBER_AI_CREDIT: 'AI Credit',
      },
      AggregationMethods: {
        COUNT: 'Count',
        SUM: 'Sum',
        AVERAGE: 'Average',
        MIN: 'Minimum',
        MAX: 'Maximum',
        LATEST: 'Latest',
      },
      ResetPeriods: {
        NONE: 'Never (lifetime)',
        HOUR: 'Every hour',
        DAY: 'Every day',
        WEEK: 'Every week',
        MONTH: 'Every month',
        YEAR: 'Every year',
      },
      ResetAnchors: {
        CALENDAR: 'Calendar',
        LICENSE_START: 'License start date',
        BILLING_PERIOD: 'Billing date',
        billingPeriodUnavailable: 'Billing date (monthly or yearly only)',
      },
    },
    FeatureFlags: {
      title: 'Feature Flags',
      subtitle:
        'Manage feature releases with targeting rules and evaluation testing',
      Stats: {
        totalFlags: 'Total Flags',
        enabled: 'Enabled',
        disabled: 'Disabled',
        withTargeting: 'With Targeting',
      },
      Table: {
        Columns: {
          name: 'Name',
          description: 'Description',
          type: 'Type',
          enabled: 'Enabled',
          variants: 'Variants',
          targetings: 'Targeting Rules',
          metadata: 'Metadata',
        },
        Dialogs: {
          metadataTitle: 'Feature flag metadata',
          metadataDescription:
            'Operational metadata used by evaluation and control-plane tooling.',
          metadataTrigger: 'Open feature flag metadata',
        },
      },
      Detail: {
        enabled: 'Enabled',
        disabled: 'Disabled',
        editName: 'Edit name',
        buttons: {
          tryIt: 'Try it',
          configure: 'Configure',
        },
        badges: {
          event: 'event: {{eventName}}',
        },
        fallback: {
          noDescription: 'No description provided.',
          notAvailable: 'n/a',
          unknownVariant: 'unknown variant',
        },
        defaultVariantTypes: {
          basic: 'Simple variant',
          rolloutDate: 'Date-based rollout',
          rolloutPercentage: 'Percentage rollout',
        },
        stats: {
          variants: {
            label: 'Variants',
            helper: 'Configured variants',
          },
          targetingRules: {
            label: 'Targeting Rules',
            helper: '{{count}} rollout-based rules',
          },
          evaluations: {
            label: 'Evaluations (session)',
            helper: 'Captured from Try it',
          },
          defaultStrategy: {
            label: 'Default Strategy',
            helperDistribution: '{{count}}% total distribution',
            helperSingle: 'Single fallback strategy',
          },
        },
        tabs: {
          overview: 'Overview',
          variants: 'Variants',
          targeting: 'Targeting',
          evaluation: 'Try it history',
        },
        Overview: {
          general: {
            title: 'General Information',
            description: 'Core identity and ownership metadata for the flag.',
            fields: {
              type: 'Type',
              eventName: 'Event Name',
              slug: 'Slug',
              id: 'ID',
              enabled: 'Status',
              owner: 'Owner',
            },
            audit: {
              createdAt: 'Created',
              updatedAt: 'Last updated',
              by: 'by',
            },
          },
          defaultVariant: {
            title: 'Default Variant Strategy',
            description:
              'Returned when no targeting rule matches or when targeting is bypassed.',
            total: 'total: {{count}}%',
            basicValue: 'Returns variant {{variant}}',
            start: 'Start',
            end: 'End',
          },
          metadata: {
            title: 'Metadata',
            description:
              'Operational metadata consumed by control-plane and incident tooling.',
            empty: 'No metadata.',
          },
        },
        Variants: {
          definition: {
            title: 'Variants Definition',
            description:
              'Variant names are referenced by default strategy and targeting rules.',
            columns: {
              variant: 'Variant',
              description: 'Description',
              payloadPreview: 'Payload Preview',
              usedInDefault: 'Used In Default',
            },
            empty: 'No variants configured.',
          },
          defaultUsage: {
            dateBased: 'date-based',
            default: 'Default',
          },
        },
        Targeting: {
          rules: {
            title: 'Targeting Rules (ordered)',
            description:
              'Evaluation uses first-match-wins. Keep the most specific rules on top.',
            empty: 'No targeting rules configured.',
            index: '#{{index}}',
            returnVariant: 'Return variant',
            distribution: 'Distribution by variant bucket',
            total: 'total: {{total}}%',
            start: 'Start',
            end: 'End',
          },
          fallback: {
            title: 'Fallback step',
            description:
              'If no targeting rule matches, resolve from default strategy {{type}}.',
          },
        },
        Evaluation: {
          samples: {
            title: 'Try it history',
            description:
              'What Try it returned in this browser session. Nothing here is stored.',
            columns: {
              context: 'Context',
              variant: 'Variant',
              reason: 'Reason',
              value: 'Value',
            },
            empty: 'No evaluations yet. Run Try it to populate this table.',
          },
          session: {
            title: 'This session',
            description: 'Counts from the Try it runs of this browser session.',
            evaluations: 'Evaluations',
            distinctVariants: 'Distinct variants',
            targetingRules: 'Targeting rules',
            owner: 'Owner: {{owner}}',
            defaultStrategy: 'Default strategy: {{type}}',
          },
          contextDialog: {
            trigger: '</>',
            title: 'Evaluation Context',
            description: 'Raw JSON payload for evaluation {{evaluationId}}.',
          },
        },
      },
      Mutation: {
        titleNew: 'New Feature Flag',
        titleUpdate: 'Edit Feature Flag',
        Form: {
          Steps: {
            step1: 'Basic Information',
            step2: 'Variants Configuration',
            step3: 'Default Variant',
            step4: 'Targeting Rules',
          },
          Step1: {
            title: 'Basic Information',
            Labels: {
              name: 'Name',
              description: 'Description',
              slug: 'Slug',
              type: 'Type',
              enabled: 'Enable this feature flag',
              statusEnabled: 'Enabled',
              statusDisabled: 'Disabled',
            },
            Placeholders: {
              name: 'Beta Access',
              description: 'Controls access to beta features',
              slug: 'beta-access',
              type: 'Select type',
            },
            Descriptions: {
              name: 'Human-readable flag name (e.g., "Beta Access")',
              description:
                'Optional description of what this feature flag controls',
              slug: 'Unique identifier used for evaluation (kebab-case, auto-generated from name)',
              type: 'Data type for flag variants (boolean, string, number, object)',
              enabled:
                'When disabled, the feature flag will always return the default variant regardless of targeting rules',
            },
          },
          Step2: {
            title: 'Variants Configuration',
            availableVariants: 'Available variants',
            Labels: {
              variants: 'Variants',
              defaultVariant: 'Default Variant',
            },
            Placeholders: {
              variants:
                '[{"name": "on", "description": "Feature enabled", "value": true}, {"name": "off", "description": "Feature disabled", "value": false}]',
              defaultVariant: '"off"',
            },
            Descriptions: {
              variants:
                'Array of allowed values. Each variant must have a name, description, and value matching the flag type',
              defaultVariant:
                'Default variant name (must exist in variants list) or rollout configuration object',
            },
            noVariantsWarning:
              'Please create at least one variant above before selecting the default variant.',
            Errors: {
              atLeastOneVariant: 'At least one variant is required',
              allVariantsMustBeValid:
                'All variants must have a name and a valid value',
              defaultVariantRequired:
                'Please select a default variant from the list',
            },
          },
          Step3: {
            title: 'Default Variant',
            DefaultVariant: {
              title: 'Default Variant Configuration',
              description:
                'Configure the variant to return when no targeting rules match or as a progressive rollout strategy',
              typeLabel: 'Default Variant Type',
              variantLabel: 'Default Variant',
              fallbackVariantLabel: 'Codegen Default Variant',
              fallbackVariantDescription:
                'Variant used as the default fallback in generated code only. Not used for runtime evaluation.',
              fallbackValueLabel: 'Codegen Default Value',
              fallbackValueDescription:
                'Value embedded as the default fallback in generated code. Used only when consuming the flag via generated SDKs. Auto-filled from the selected variant, but can be overridden.',
              Types: {
                simple: 'Simple Variant',
                rolloutDate: 'Progressive Rollout (Date-based)',
                rolloutPercentage: 'A/B Test (Percentage-based)',
              },
            },
            Errors: {
              defaultVariantRequired:
                'Please select a default variant from the list',
            },
          },
          Step4: {
            title: 'Targeting Rules',
            subtitle: 'Define CEL-based conditions for dynamic flag evaluation',
            exampleBasicTargeting: 'Basic Targeting (Simple Rule)',
            exampleRolloutDate: 'Rollout by Date (Progressive)',
            exampleRolloutPercentage: 'Rollout by Percentage (A/B Test)',
            Labels: {
              targetings: 'Targeting Rules',
              eventName: 'Event Name',
              metadata: 'Metadata',
            },
            Placeholders: {
              targetings: '[]',
              eventName: 'feature_flag_evaluated',
              metadata: '{}',
            },
            Descriptions: {
              targetings:
                'Array of CEL-based targeting rules evaluated at runtime. Rules are checked in order until a match is found.',
              eventName: 'Event name for tracking (auto-generated if empty)',
              metadata:
                'Optional metadata for documentation or integration purposes',
            },
            Examples: {
              basic:
                '{"type": "basic", "name": "Enterprise Customers", "rule": "__kaiten.license.familySlug == \\"scale\\" && __kaiten.deploymentZone.type == \\"production\\"", "variant": "on"}',
              rolloutDate:
                '{"type": "rollout_date", "name": "EU Gradual Rollout", "rule": "__kaiten.deploymentZone.type == \\"production\\"", "start": {"date": "2025-01-01T00:00:00Z", "percentage": 0, "variant": "on"}, "end": {"date": "2025-01-31T23:59:59Z", "percentage": 100, "variant": "on"}}',
              rolloutPercentage:
                '{"type": "rollout_percentage", "name": "Premium A/B Test", "rule": "__kaiten.license.familySlug == \\"premium\\"", "distribution": {"on": 50, "off": 50}}',
            },
            Errors: {
              defaultVariantRequired: 'Please select a default variant',
            },
          },
          Buttons: {
            next: 'Next',
            back: 'Back',
            create: 'Create Feature Flag',
            update: 'Update Feature Flag',
          },
          SubmitBlockers: {
            title: 'You still need to fix the following before submitting:',
            stepTitle: 'Complete this step before continuing:',
            iconLabel: 'Why submission is unavailable',
            Reasons: {
              submissionInProgress: 'Submission is already in progress.',
              validationInProgress: 'Validation is still running.',
              noChangesCreate:
                'Fill in the form before creating the feature flag.',
              noChangesUpdate:
                'Make at least one change before updating the feature flag.',
              nameRequired: 'Name is required.',
              slugRequired: 'Slug is required.',
              slugInvalid:
                'Slug must use kebab-case and contain 2 to 100 characters.',
              reviewForm:
                'Review the highlighted fields and configuration before submitting.',
            },
          },
          Dialog: {
            createSuccess: 'Feature flag created successfully',
            updateSuccess: 'Feature flag updated successfully',
          },
          TypeChangeDialog: {
            title: 'Confirm Type Change',
            description:
              'Changing the feature flag type will reset all variants and targeting rules. This action cannot be undone. Are you sure you want to continue?',
            cancel: 'Cancel',
            confirm: 'Change Type',
          },
        },
      },
      Card: {
        enabled: 'Enabled',
        disabled: 'Disabled',
        enableAction: 'Enable',
        disableAction: 'Disable',
        enabledSuccess: 'Feature flag enabled successfully',
        disabledSuccess: 'Feature flag disabled successfully',
        confirmEnableTitle: 'Enable {{name}}?',
        confirmDisableTitle: 'Disable {{name}}?',
        confirmToggleDescription:
          'The change applies to every evaluation of this flag, immediately.',
        tryIt: 'Try it',
        view: 'View',
        configure: 'Configure',
        targetingRules_one: 'targeting rule',
        targetingRules_other: 'targeting rules',
        variants_one: 'variant',
        variants_other: 'variants',
        noTargeting:
          'No targeting rules — all evaluations return the default value.',
        empty: 'No feature flags yet. Create one to get started.',
      },
      TryIt: {
        title: 'Try it',
        description: 'Evaluate flag',
        contextLabel: 'Evaluation context',
        contextHint: 'JSON object — must include "targetingKey".',
        invalidJson: 'Invalid JSON — please fix the syntax and try again.',
        missingTargetingKey:
          'The evaluation context must include a "targetingKey" field.',
        result: 'Result',
        evaluatedValue: 'Evaluated value:',
        variant: 'Variant',
        close: 'Close',
        evaluate: 'Evaluate',
        evaluating: 'Evaluating…',
      },
      Types: {
        boolean: 'Boolean',
        string: 'String',
        number: 'Number',
        object: 'Object (JSON)',
      },
      TargetingTypes: {
        basic: 'Basic Targeting',
        rollout_date: 'Date-based Rollout',
        rollout_percentage: 'Percentage-based Rollout',
      },
      CEL: {
        title: 'CEL (Common Expression Language)',
        description: 'Secure, typed rule evaluation for feature flags',
        docs: 'See: https://github.com/google/cel-spec',
      },
      OpenFeature: {
        title: 'OpenFeature & OFREP Compatible',
        description:
          'Kaiten implements OpenFeature standards for interoperable flag evaluation',
      },
    },
    Integrations: {
      title: 'Integrations',
      PublishableKeys: {
        title: 'Publishable keys',
        subtitle:
          'The keys a web page uses to read your public catalog and, if you allow it, to start anonymous checkouts',
        Intro: {
          purpose:
            'A publishable key lets a web page read your public catalog: it sends the key in the X-Kaiten-Publishable-Key header to GET /public/catalog. It is not a secret. It reads nothing else, and starts anonymous checkouts only if you allow it to.',
          listing:
            'What the catalog lists is decided by the Public catalog switch of each license and add-on:',
          licenses: 'Licenses',
          addons: 'Add-ons',
        },
        List: {
          new: 'New publishable key',
          includeRevoked: 'Include revoked',
          keyHint: '…{{hint}}',
          neverUsed: 'Never used',
          noOrigins: 'No browser origin',
          showMore: 'Show {{count}} more',
          showFewer: 'Show fewer',
          Columns: {
            label: 'Label',
            key: 'Key',
            origins: 'Allowed origins',
            created: 'Created',
            lastUsed: 'Last used',
            status: 'Status',
          },
          Status: {
            live: 'Live',
            revoked: 'Revoked',
            anonymousCheckout: 'Anonymous checkout',
          },
          Actions: {
            edit: 'Edit {{label}}',
            revoke: 'Revoke {{label}}',
          },
          Filters: {
            search: 'Search',
            searchPlaceholder: 'Search by label, key ending or origin',
            clear: 'Clear the search',
          },
          Empty: {
            title: 'No publishable key yet',
            description:
              'Issue a key to let a web page read your public catalog.',
            filteredTitle: 'No key matches',
            filteredDescription: 'No publishable key matches this search.',
          },
        },
        Create: {
          title: 'New publishable key',
          description: 'The key is shown once, when you create it.',
          submit: 'Create key',
          Created: {
            title: 'Publishable key created',
            description: 'Copy the key now and put it in your web page.',
            warning:
              'You will not see this key again. Only its last four characters, {{hint}}, stay visible in the list.',
            keyLabel: 'Key {{label}}',
            copy: 'Copy the key',
            copied: 'Key copied',
            copyFailed: 'The key could not be copied',
            done: 'Done',
            Leave: {
              title: 'Close without the key?',
              description:
                'You have not copied this key, and it will not be shown again. If you close now, you will have to create a new key.',
              stay: 'Back to the key',
              leave: 'Close without copying',
            },
          },
        },
        Edit: {
          title: 'Edit {{label}}',
          description:
            'Change what the key is for, the origins that may send it and whether it opens the anonymous checkout. The key itself does not change.',
          save: 'Save',
          saved: '{{label}} saved',
          revoked:
            'This key was revoked in the meantime. A revoked key can no longer change: create a new key instead.',
        },
        Form: {
          Labels: {
            label: 'Label',
            origins: 'Allowed origins',
            anonymousCheckout: 'Allow anonymous checkout',
            turnstileSiteKey: 'Turnstile site key',
            turnstileSecret: 'Turnstile secret',
          },
          Placeholders: {
            label: 'Marketing site',
            origins: 'https://www.example.com',
            turnstileSiteKey: '0x4AAAAAAA…',
          },
          Descriptions: {
            label:
              'What the key is for, to tell your keys apart (up to 100 characters).',
            origins:
              'One origin per line, at most {{max}}: https://host, or http://localhost, with a port if there is one. No path. Leave it empty to allow no browser origin.',
            anonymousCheckout:
              'Once on, every visitor of this key’s origins can start a checkout and create a customer. It needs a site key and a secret.',
            turnstileSiteKey:
              'The public key of your Turnstile widget: letters, digits, hyphens and underscores. The page draws the widget with it.',
            turnstileSecret:
              'The secret of the same widget. Kaiten stores it in Vault and never shows it again.',
            vaultMissing:
              'Anonymous checkout needs a configured Vault: this deployment cannot store a Turnstile secret.',
          },
          Anonymous: {
            title: 'Anonymous checkout',
            description:
              'Lets a visitor with no account buy from your page. Cloudflare Turnstile guards it, on the site key and the secret of a widget registered for the origins above.',
          },
          Secret: {
            stored: 'A secret is stored for this key. It is never shown.',
            removing: 'The secret will be removed when you save.',
            removingWhileOn:
              'The secret will be removed when you save, but anonymous checkout needs one. Keep the secret, or turn anonymous checkout off.',
            replace: 'Replace',
            remove: 'Remove',
            undo: 'Keep the secret',
            keep: 'Keep the current secret',
          },
          rejected: 'Not an origin: {{origins}}',
          Errors: {
            label: 'Enter a label',
            labelTooLong: 'That label is too long',
            origins:
              'Each origin is https://host[:port], or http://localhost[:port], with no path, query or fragment',
            tooManyOrigins: 'That is too many origins for one key',
            turnstileSiteKey:
              'A site key is 1 to 255 letters, digits, hyphens or underscores',
            turnstileSecretTooLong: 'That secret is too long',
            turnstileSecretRequired:
              'Enter the new secret, or keep the current one',
            turnstileRequired:
              'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
            vaultNotConfigured:
              'This deployment has no Vault, so it cannot store a Turnstile secret. Configure a Vault, or leave anonymous checkout off.',
          },
        },
        Revoke: {
          title: 'Revoke {{label}}?',
          description:
            'The key ending in {{hint}} stops working on the next request: every page that sends it stops reading your catalog and can no longer start an anonymous checkout. A revoked key cannot be restored: create a new one to replace it.',
          confirm: 'Revoke key',
          success: '{{label}} revoked',
        },
      },
      Connectors: {
        title: 'Connectors',
        pageDescription:
          'Sync Kaiten data with your CRM and billing tools. Each connector runs independently and can be configured per organization.',
        Status: {
          connected: 'Connected',
          available: 'Available',
          unavailable: 'Unavailable',
          comingSoon: 'Coming soon',
        },
        Sections: {
          connected: 'Connected ({{count}})',
          crm: 'CRM',
          billing: 'Billing',
          noConnectors: 'No active connectors.',
        },
        Taglines: {
          attio: 'Modern B2B CRM',
          hubspot: 'CRM platform',
          stripe: 'Subscription billing',
        },
        Card: {
          connect: 'Connect',
          manage: 'Manage',
        },
        Toast: {
          connected: 'Attio connector connected.',
          disconnected: 'Attio connector disconnected.',
          mappingUpdated: 'Attio field mappings updated.',
        },
        Stripe: {
          title: 'Stripe connector',
          subtitle:
            'Kaiten composes what each customer owes. Stripe collects it.',
          openInStripe: 'Open in Stripe',
          disconnect: 'Disconnect',
          Mode: {
            test: 'Test mode',
            live: 'Live mode',
          },
          Unavailable: {
            VAULT_NOT_CONFIGURED: {
              title: 'Stripe needs a configured Vault',
              description:
                'Kaiten stores the restricted key of your Stripe account in Vault, and this deployment has none. Set up Vault (VAULT_ADDR), then come back here to connect Stripe. Invoices are still composed and handed off to your accounting system meanwhile.',
              tile: 'Stripe needs a configured Vault',
            },
            NOT_ENTITLED: {
              title: 'Not included in your plan',
              description:
                'The Stripe connector is not part of the plan of this organization. Upgrade the plan to connect Stripe. Invoices are still composed and handed off to your accounting system meanwhile.',
              tile: 'Not included in your plan',
            },
            UNKNOWN: {
              title: 'Stripe is not available here',
              description:
                'This deployment does not offer Stripe to the organization. Invoices are composed and handed off to your accounting system.',
              tile: 'Not available on this deployment',
            },
            vaultDocs: 'Self-hosting settings',
          },
          Settings: {
            title: 'Connection',
            description:
              'The restricted key of your Stripe account, and how Kaiten builds and pushes invoices to it.',
            readOnly:
              'You can read these settings and not change them: the connector is configured by someone who can write the settings of the organization.',
            connect: 'Connect Stripe',
            reconnect: 'Connect Stripe with the stored key',
            save: 'Save changes',
            keyLabel: 'Restricted API key',
            keyPlaceholder: 'rk_test_…',
            keyOnFilePlaceholder:
              'Key set ({{mode}}) — enter a new key to replace it',
            keyOnFilePlaceholderNoMode:
              'Key set — enter a new key to replace it',
            keyHint:
              'Create it in Stripe, under Developers → API keys. Kaiten stores it in Vault, checks it with a read-only call and never shows it again.',
            keyReaches: 'This key reaches a Stripe account in {{mode}}.',
            taxBehaviorLabel: 'Tax',
            taxBehaviorHint:
              'Whether the amounts Kaiten composes leave tax out (Stripe adds it) or already include it.',
            TaxBehavior: {
              EXCLUSIVE: 'Amounts exclude tax',
              INCLUSIVE: 'Amounts include tax',
            },
            automaticTaxLabel: 'Compute tax automatically',
            automaticTaxHint:
              'Stripe Tax computes the tax of every invoice. It needs a complete address on the customer in Stripe, or the push of its invoices fails.',
            autoFinalizeLabel: 'Finalize invoices automatically',
            autoFinalizeHint:
              'Off, an invoice stops as a draft in Stripe, where someone reviews it and Kaiten finalizes it on request.',
            Errors: {
              keyRequired: 'Paste the restricted key of your Stripe account.',
              secretKey:
                'Use a restricted key (rk_…): a secret key (sk_…) gives Kaiten access to far more than it needs.',
              publishableKey:
                'A publishable key (pk_…) cannot create invoices. Use a restricted key (rk_…).',
              keyFormat:
                'A restricted key starts with rk_test_ or rk_live_, followed by letters and digits.',
            },
          },
          Split: {
            title: 'Who does what',
            kaiten: 'Kaiten owns',
            stripe: 'Stripe owns',
            Kaiten: {
              catalogue: 'The catalog and its prices',
              entitlements: 'What each instance is entitled to',
              usage: 'The journal of usage',
              subscription: 'The subscription of each instance',
              content: 'What each invoice says',
            },
            Stripe: {
              tax: 'Tax',
              numbering: 'Invoice numbers',
              presentation: 'How an invoice looks and is sent',
              payment: 'Payment and receipts',
              dunning: 'Retries and reminders',
            },
          },
          Permissions: {
            title: 'Permissions of the key',
            description:
              'Create the restricted key with exactly these permissions: no more, and no less.',
            write: '{{resource}}: write',
            read: '{{resource}}: read',
          },
          Toast: {
            connected: 'Stripe connected.',
            saved: 'Stripe settings saved.',
            disconnected: 'Stripe disconnected.',
          },
          Disconnect: {
            title: 'Disconnect Stripe?',
            description:
              'Kaiten stops pushing invoices to Stripe and reading them back. The key stays stored, so that connecting again does not ask for it. Invoices already in Stripe are not touched.',
            confirm: 'Disconnect',
            subscriptions_one:
              '{{count}} subscription that is not canceled is still collected through Stripe.',
            subscriptions_other:
              '{{count}} subscriptions that are not canceled are still collected through Stripe.',
            invoices_one:
              '{{count}} invoice that is not settled is still in Stripe.',
            invoices_other:
              '{{count}} invoices that are not settled are still in Stripe.',
          },
        },
        Wizard: {
          headerTitle: 'Connect Attio',
          headerSubtitle: 'Set up the Kaiten → Attio sync direction',
          cancel: 'Cancel',
          back: 'Back',
          continue: 'Continue',
          finish: 'Finish',
          stepProgress: 'Step {{current}} of {{total}}',
          Steps: {
            connect: 'Connect',
            schema: 'Schema',
          },
          Connect: {
            title: 'Connect to your Attio workspace',
            description:
              'Paste an Attio API token. You can generate one in Attio → Settings → Developers → API tokens. The token is scoped to a single Attio workspace, which is where Kaiten will sync.',
            tokenLabel: 'Attio API token',
            tokenPlaceholder: 'atk_live_••••••••••••••••••',
            tokenHint:
              'Stored encrypted. Revocable from your Attio workspace at any time.',
            syncPolicyLabel: 'Sync policy',
            syncPolicyHint:
              'What to do when a related record is missing during a sync.',
            SyncPolicy: {
              createAndBind: 'Create & bind (recommended)',
              failAndRetry: 'Fail & retry',
            },
          },
          Schema: {
            title: 'Map Kaiten data to Attio',
            description:
              'Customer → Attio Company, Instance → Attio Workspace. Values sync as text. The defaults below are always applied; add optional mappings to existing Attio attribute slugs.',
            defaultsTitle: 'Always synced (defaults)',
            optionalTitle: 'Optional field mappings',
            addRow: 'Add field mapping',
            selectSourceField: 'Select a source field…',
            searchSourceField: 'Search fields…',
            kaitenTable: 'Kaiten table: {{table}}',
            attioSlugPlaceholder: 'attio_attribute_slug',
            invalidSlug:
              'Attio slugs are lowercase snake_case (letters, digits, underscores).',
            incompleteMapping:
              'Choose both a Kaiten source field and an Attio attribute slug.',
            duplicateSource:
              'Each Kaiten source field can only be mapped once.',
            duplicateTarget:
              'Two fields on the same Attio object cannot target the same attribute slug.',
            defaultBadge: 'Default',
            removeMapping: 'Remove mapping',
            SourceFieldGroup: {
              company: 'Company (from Customer)',
              workspace: 'Workspace (from Instance)',
            },
            Table: {
              sourceField: 'Kaiten source field',
              attioObject: 'Attio object',
              attioSlug: 'Attio attribute (slug)',
            },
            FooterNote: {
              title: 'Attio attributes must exist beforehand',
              description:
                'Mappings target existing Attio attribute slugs and are written as text. Create the attribute in your Attio workspace first.',
              helpLink: 'How to create a custom attribute in Attio',
            },
          },
        },
        Detail: {
          subtitle:
            'Workspace-scoped Attio connector, configured for this organization.',
          openInAttio: 'Open in Attio',
          disconnect: 'Disconnect',
          DisconnectDialog: {
            title: 'Disconnect Attio?',
            description:
              'This deletes the stored Attio configuration (API key, sync policy, field mappings) and stops future syncs. Records already created in Attio are kept.',
            confirmButton: 'Disconnect',
          },
          Config: {
            syncPolicy: 'Sync policy',
            fieldMappings: 'Field mappings',
            apiUrl: 'Attio API URL',
          },
          EditMapping: {
            title: 'Edit field mappings',
            description:
              'Adjust the optional source field → Attio attribute mappings. Defaults always apply; changes affect future syncs only.',
          },
          SyncedRecords: {
            title: 'Synced records',
            description:
              'Kaiten customers and instances linked to an Attio record.',
            refresh: 'Refresh',
            loading: 'Loading synced records…',
            error: 'Failed to load synced records.',
            empty: 'No records synced to Attio yet.',
            never: 'Never',
            statusSynced: 'Synced',
            statusError: 'Error',
            Table: {
              record: 'Kaiten record',
              object: 'Attio object',
              recordId: 'Attio record id',
              syncedAt: 'Synced at',
              status: 'Status',
            },
          },
        },
        EntitySync: {
          title: 'Attio Synchronization',
          customerDescription: 'This customer is linked to a CRM company',
          instanceDescription: 'This instance is linked to a CRM workspace',
          domain: 'Domain',
          syncStatus: 'Sync status',
          lastSynced: 'Last synced',
          never: 'Never',
          viewInCrm: 'View in CRM',
          openInAttio: 'Open in Attio',
          tooltipTitle: 'Synced with Attio',
          statusSynced: 'Synced with Attio',
          statusError: 'Attio sync error',
          statusPending: 'Attio synchronization in progress',
          statusPendingShort: 'In progress',
          statusDelayed: 'Attio synchronization is taking longer than expected',
          pendingDescription:
            'Kaiten is creating the corresponding record in Attio.',
          updatingDescription:
            'Kaiten is updating the corresponding record in Attio.',
          delayedDescription:
            'The synchronization is still running or will be retried in the background.',
          errorDialog: {
            openLabel: 'View Attio synchronization error details',
            title: 'Attio synchronization error',
            description:
              'Review the latest error returned while synchronizing this record with Attio.',
            recordId: 'Attio record ID',
            lastAttempt: 'Last attempt',
            errorDetails: 'Error details',
          },
        },
      },
      ServiceAccounts: {
        title: 'Service Accounts',
        description:
          'Service accounts allow you to authenticate applications and services with granular scope-based permissions',
        createButton: 'Create Service Account',
        emptyState: 'No service accounts yet. Create one to get started.',
        tokensCount: '{{count}} token',
        tokensCount_other: '{{count}} tokens',
        createdAt: 'Created',
        generateToken: 'Generate Token',
        noTokens:
          'No tokens for this service account. Generate one to get started.',
        noActiveTokens: 'No active tokens. All tokens have been revoked.',
        noRevokedTokens: 'No revoked tokens.',
        deleteServiceAccount: 'Delete service account',
        Filters: {
          activeTokens: 'Active tokens',
          revokedTokens: 'Revoked tokens',
        },
        Dialog: {
          createTitle: 'Create Service Account',
          createDescription:
            'Create a new service account to authenticate your applications and services.',
          nameLabel: 'Name',
          namePlaceholder: 'e.g., CI/CD Pipeline',
          nameDescription: 'Choose a descriptive name for this service account',
          nameRequired: 'Name is required',
          createButton: 'Create',
        },
        NewToken: {
          title: 'New Token',
          description: 'For the service account {{name}}',
          Details: {
            title: 'Details',
            nameLabel: 'Name',
            namePlaceholder: 'e.g., Production SDK',
            nameDescription:
              'Say where the token is used, so you know which one to revoke',
            nameRequired: 'Token name is required',
            expirationLabel: 'Expiration date',
            expirationDescription: 'Leave empty for a token that never expires',
          },
          Access: {
            title: 'Access',
            description:
              'What this token can reach: start from a preset, then adjust each resource.',
            adjust: 'Adjust per resource',
            dialogTitle: 'Access per resource',
            dialogDescription: 'Choose the access of each resource.',
            done: 'Done',
            clear: 'Clear',
            accessRequired: 'Grant access to at least one resource',
            summary: '{{count}} scope',
            summary_other: '{{count}} scopes',
            empty: 'No access selected yet',
          },
          onceWarning:
            'The token is shown once, right after it is created: Kaiten keeps only a hash of it.',
          submit: 'Create Token',
          Created: {
            title: 'Token Created',
            description: '{{token}}, for the service account {{name}}',
            copyTitle: 'Copy your token now',
            copyWarning:
              "You won't be able to see it again once you leave this page.",
            copyToken: 'Copy token',
            copied: 'Token copied to clipboard',
            copyFailed: 'The token could not be copied',
            detailsTitle: 'Details',
            scopes: 'Scopes',
            expires: 'Expires',
            never: 'Never',
            done: 'Back to Service Accounts',
          },
        },
        Scopes: {
          presetGrants: '{{level}}: {{resources}}',
          levelsLabel: 'Access to {{resource}}',
          Levels: {
            none: 'No access',
            read: 'Read',
            write: 'Read & write',
          },
          Groups: {
            customers: { label: 'Customers' },
            licensing: { label: 'Licensing' },
            featureFlags: { label: 'Feature Flags' },
            releases: { label: 'Releases' },
            billing: { label: 'Billing' },
            organization: { label: 'Organization' },
          },
          Presets: {
            dataPlane: {
              label: 'Data plane',
              description:
                'An SDK inside your product: evaluates flags, reads licensing, reports usage',
            },
            controlPlane: {
              label: 'Control plane',
              description:
                'Automation that runs your fleet: customers, licenses, releases, deployments',
            },
          },
          Resources: {
            components: {
              label: 'Components',
              description: 'Access to component versions shipped in releases',
            },
            customers: {
              label: 'Customers',
              description: 'Access to customer data and management',
            },
            featureFlags: {
              label: 'Feature Flags',
              description: 'Access to feature flag configuration',
            },
            instances: {
              label: 'Instances',
              description: 'Access to instance management and usage reports',
            },
            licenses: {
              label: 'Licenses',
              description: 'Access to license management',
            },
            entitlements: {
              label: 'Entitlements',
              description: 'Access to entitlement definitions',
            },
            addons: {
              label: 'Add-ons',
              description:
                'Access to the add-on catalog: versions, prices and the entitlements they grant',
            },
            deploymentZones: {
              label: 'Deployment Zones',
              description: 'Access to deployment zone management',
            },
            releases: {
              label: 'Releases',
              description: 'Access to release management',
            },
            metadataFields: {
              label: 'Metadata Fields',
              description: 'Access to metadata field definitions',
            },
            notifications: {
              label: 'Notifications',
              description:
                'Access to its own notification feed and preferences',
            },
            billing: {
              label: 'Billing',
              description:
                'Access to subscriptions, invoices, the handoff queue and billing settings',
            },
            vouchers: {
              label: 'Vouchers',
              description:
                'Access to vouchers: create, publish and archive them, and revoke a redemption',
            },
            voucherRedemptions: {
              label: 'Voucher redemptions',
              description:
                "Access to an instance's vouchers: check a code and redeem it",
            },
            customerSessions: {
              label: 'Customer sessions',
              description:
                "Access to customer sessions: open one for a customer's self-serve billing page, and end it",
            },
            publishableKeys: {
              label: 'Publishable keys',
              description:
                'Access to publishable keys: issue and revoke the pk_ keys a web page reads the public catalog with',
            },
            organizations: {
              label: 'Organizations',
              description: 'Access to organization settings and connectors',
            },
            tokens: {
              label: 'Tokens',
              description: 'Access to service accounts and their tokens',
            },
            webhooks: {
              label: 'Webhooks',
              description: 'Access to outbound webhook subscriptions',
            },
          },
        },
        Token: {
          expired: 'Expired',
          expires: 'Expires',
          revoked: 'Revoked',
          scopes: 'Scopes',
          externalId: 'External ID',
          createdBy: 'Created by',
          revokedOn: 'Revoked',
          by: 'by',
          revoke: 'Revoke',
          revokeConfirmTitle: 'Revoke Token',
          revokeConfirmDescription:
            'Are you sure you want to revoke the token "{{name}}"? This action cannot be undone.',
          revokeSuccess: 'Token revoked successfully',
          typeCustom: 'Custom',
          filterAll: 'All',
          filterActive: 'Active',
          filterRevoked: 'Revoked',
        },
      },
      Webhooks: {
        sectionTitle: 'Webhooks',
        sectionDescription: 'Configure webhooks for lifecycle events',
        pageDescription:
          'Configure event webhooks and review recent delivery history.',
        title: 'Event Webhooks',
        description:
          'Configure webhooks to be triggered when specific lifecycle events occur. You can select multiple events for a single webhook.',
        newButton: 'New  Webhook',
        emptyState: 'No webhooks configured yet.',
        emptyStateHint:
          'Create a webhook to receive notifications when events occur.',
        Tabs: {
          event: 'Events',
          history: 'History',
        },
        EventGroups: {
          customer: 'Customers',
          instance: 'Instances',
          license: 'Licenses',
          licenseFamily: 'License families',
          addon: 'Add-ons',
          entitlement: 'Entitlements',
          entitlementGroup: 'Entitlement groups',
          usage: 'Usage',
          subscription: 'Subscriptions',
          invoice: 'Invoices',
          voucher: 'Vouchers',
          payment: 'Payments',
          checkout: 'Checkouts',
          featureFlag: 'Feature flags',
          release: 'Releases',
          deploymentZone: 'Deployment zones',
          component: 'Components',
          metadataField: 'Metadata fields',
          identity: 'Identity & access',
          other: 'Other events',
        },
        Filters: {
          queryPlaceholder: 'Search webhooks',
        },
        Table: {
          events: 'Events',
          url: 'Webhook URL',
          signingSecret: 'Signing secret',
          created: 'Created',
          showSigningSecret: 'Show signing secret',
          hideSigningSecret: 'Hide signing secret',
          copySigningSecret: 'Copy signing secret',
          signingSecretCopied: 'Signing secret copied',
          signingSecretLoadError: 'Failed to load signing secret',
          signingSecretCopyError: 'Failed to copy signing secret',
        },
        Dialog: {
          title: 'New Webhook',
          description:
            'Configure a webhook to receive notifications when lifecycle events occur. Select one or more events to trigger this webhook.',
          eventsLabel: 'Events',
          eventsSelected: 'selected',
          selectedEvents: 'Selected events',
          selectedEventsPlaceholder: 'No events selected yet.',
          eventsRequired: 'Select at least one event.',
          urlLabel: 'Webhook URL',
          urlPlaceholder: 'https://api.example.com/webhooks/kaiten',
          urlRequired: 'Webhook URL is required.',
          urlInvalid: 'Enter a valid URL.',
          urlDescription:
            'The webhook will receive a POST request with the event payload when any of the selected events occur',
          createButton: 'Create Webhook',
        },
        History: {
          sectionTitle: 'Webhooks history',
          sectionDescription:
            'Webhook delivery history with status and failure details',
          description:
            'Recent delivery attempts for your webhooks. Failed deliveries include error details.',
          emptyState: 'No webhook deliveries yet.',
          emptyStateHint:
            'Deliveries will appear here after your event webhooks are triggered.',
          Filters: {
            queryPlaceholder: 'Search deliveries',
          },
          filterBy: 'Filter by',
          eventFilter: 'Event',
          hookFilter: 'Webhook URL',
          allEvents: 'All events',
          allWebhooks: 'All webhooks',
          Stats: {
            total: 'Total: {{count}}',
            success: 'OK: {{count}}',
            failed: 'Failed: {{count}}',
          },
          Status: {
            success: 'OK',
            pending: 'Pending',
            fail: 'Fail',
            sending: 'Sending',
          },
          Table: {
            date: 'Date',
            hookUrl: 'Hook URL',
            event: 'Event',
            status: 'Status',
            failureInfo: 'Failure info',
            actions: 'Actions',
            viewDetails: 'View details',
            emptyState: 'No deliveries match the selected filters.',
          },
          FailureDialog: {
            title: 'Failed delivery details',
            description: '{{eventName}} at {{deliveredAt}}',
            hookLabel: 'Webhook:',
            statusCodeLabel: 'HTTP status:',
            responseLabel: 'Response:',
          },
        },
      },
    },
    Billing: {
      title: 'Billing',
      Invoices: {
        title: 'Invoices',
        Subtitles: {
          all: 'Every invoice of your organization, across its customers and instances.',
          overdue:
            'The invoices past their due date and still unpaid, across your customers and instances.',
          held: 'The invoices held back before they were issued. Each waits for someone to check it, then release or recompose it.',
          waiting:
            'The invoices waiting for your ERP, oldest first. A job or the CLI takes them from the queue and acknowledges them once booked.',
          acknowledged:
            'The invoices your ERP took from the queue and acknowledged once booked.',
        },
        Views: {
          all: 'All',
          overdue: 'Overdue',
          held: 'Held',
          waiting: 'Handoff',
          acknowledged: 'Acknowledged',
        },
        Lines: {
          title: 'Lines',
        },
        Empty: {
          title: 'No invoices yet',
          description:
            'An invoice is composed when a subscription reaches a boundary. Subscribe an instance to start billing.',
          instances: 'Go to instances',
          filteredTitle: 'No invoice matches these filters',
          filteredDescription: 'Clear the filters to see more.',
          scopedCustomerTitle: 'No invoice for this customer',
          scopedInstanceTitle: 'No invoice for this instance',
          scopedDescription:
            'Nothing was invoiced for it yet. An invoice is composed when a subscription reaches a boundary.',
          showAll: 'Show every invoice',
          overdueTitle: 'No overdue invoice',
          overdueDescription:
            'An unpaid invoice past its due date appears here.',
          heldTitle: 'No held invoice',
          heldDescription:
            'An invoice that a check held appears here until someone releases or recomposes it.',
        },
        Filters: {
          clear: 'Clear filters',
          remove: 'Remove the filter {{filter}}',
          chip: '{{field}}: {{value}}',
          search: 'Search',
          searchPlaceholder: 'Customer, instance or invoice',
          status: 'Status',
          kind: 'Kind',
          provider: 'Provider',
          handoff: 'Handoff',
          overdue: 'Overdue',
          held: 'Held',
          customer: 'Customer',
          instance: 'Instance',
          issued: 'Issued',
          servicePeriod: 'Service period start',
        },
        Toasts: {
          released: 'Invoice released',
          paid: 'Invoice marked as paid',
          writtenOff: 'Invoice written off',
          voided: 'Invoice voided',
          recomposed: 'Invoice recomposed',
          replaced: 'Replacement invoice composed',
          pushRequested:
            'Push requested. Kaiten checks again every few seconds.',
          finalized: 'Invoice finalized in Stripe',
          synced: 'Invoice read from Stripe',
          syncedPaid: 'Invoice read from Stripe: it is paid',
          pushed: 'Stripe has the invoice',
          pushFailedAgain: 'The push failed again',
          awaitingFinalization:
            'Stripe has the draft. Finalize it once you have reviewed it.',
        },
        Detail: {
          title: '{{kind}} invoice, {{date}}',
          subtitle: '{{customer}} · {{instance}}',
          Actions: {
            menu: 'Actions',
            markPaid: 'Mark as paid',
            recompose: 'Recompose',
            releaseHold: 'Release the hold',
            void: 'Void',
            voidThenRecompose: 'Void and recompose',
            writeOff: 'Write off',
            retryPush: 'Retry push',
            push: 'Push now',
            finalize: 'Finalize in Stripe',
            sync: 'Read from Stripe',
            purgedUsage:
              'The usage of this period is no longer kept (before {{date}}): it cannot be recomposed.',
            instanceDeleted:
              'The instance of this invoice was deleted, so nothing can be recomposed for it.',
          },
          Provider: {
            title: 'Payment provider',
            Collection: {
              SEND_INVOICE:
                'Stripe sends the invoice to the customer and collects the payment.',
              CHARGE_AUTOMATICALLY:
                'Stripe charges the payment method on file when the invoice is due.',
            },
            status: 'Status in Stripe',
            Status: {
              draft: 'Draft',
              open: 'Open',
              paid: 'Paid',
              uncollectible: 'Uncollectible',
              void: 'Void',
            },
            number: 'Invoice number',
            externalInvoice: 'Stripe invoice',
            externalCustomer: 'Stripe customer',
            pushedAt: 'Pushed',
            syncedAt: 'Last read from Stripe',
            amounts: 'Amounts',
            Reconciliation: {
              MATCHED: 'Match',
              MISMATCH: 'Differ',
            },
            notPushed: 'Stripe does not have this invoice yet.',
            hostedInvoice: 'Hosted invoice',
            pdf: 'PDF',
            Push: {
              waiting: {
                title: 'Pushing to Stripe…',
                description:
                  'The invoice is queued. Kaiten checks again every 5 seconds, for up to two minutes.',
              },
              expired: {
                title: 'Still queued',
                description:
                  'The push has not run yet. It runs on its next pass and Kaiten keeps trying by itself: reload the page to check.',
              },
            },
            Review: {
              title: 'Awaiting finalization in Stripe',
              description:
                'Stripe holds this invoice as a draft. Review it there, then finalize it here or in Stripe: it is sent to the customer once it is finalized.',
            },
            PushError: {
              title: 'The push to Stripe failed',
              attempts_one: 'Attempt {{count}}.',
              attempts_other: '{{count}} attempts.',
              next: 'Next attempt: {{date}}.',
              manual: 'Retry it from the actions above.',
            },
            PaymentError: {
              title: 'Stripe could not collect the payment',
              Codes: {
                authentication_required:
                  'The customer must confirm the payment on the hosted invoice page.',
                card_declined: 'The card was declined.',
                expired_card: 'The card has expired.',
                no_payment_method:
                  'The customer has no payment method to charge.',
              },
            },
          },
          Reconciliation: {
            title: 'Reconciliation',
            matched: 'Stripe holds the same amounts as Kaiten.',
            mismatch:
              'Stripe holds something other than what Kaiten composed. Kaiten is authoritative: the difference is not settled in Stripe, the invoice is voided and composed again.',
            chargeWaits: 'Nothing is charged until Stripe matches Kaiten.',
            mismatchPaid:
              'Stripe holds something other than what Kaiten composed, and the invoice is already paid, so it cannot be voided there. Kaiten keeps it as paid with this difference: settle it in Stripe by hand, with a credit note and a refund.',
            mismatchVoid:
              'Stripe held something other than what Kaiten composed when this invoice was checked. It has been voided since.',
            openInStripe: 'Open the invoice in Stripe',
            checked: 'Checked {{date}}.',
            kaitenTotal: 'Total composed by Kaiten',
            providerTotal: 'Total in Stripe, excluding tax',
            providerSubtotal: 'Subtotal in Stripe',
            providerDiscounts: 'Discounts in Stripe',
            inclusiveTax:
              'Tax is included in the amounts, so the subtotal of Stripe less its discounts was compared.',
            line: 'Line',
            kaiten: 'Kaiten',
            provider: 'Stripe',
            differingLines: 'Lines whose amount differs',
            lineNumber: 'Line {{seq}}',
            differingDiscounts: 'Discounts applied with another amount',
            discountOnLine: 'Discount {{seq}} on line {{target}}',
            missingInProvider:
              'Lines Kaiten composed that Stripe does not have',
            extraInProvider: 'Lines Stripe has that Kaiten did not compose',
            extraDiscounts:
              'Discounts Stripe applied that Kaiten did not create',
            extraDiscountsHint:
              'Such as a coupon added in the Stripe dashboard.',
            discount: 'Discount',
            providerLine: 'On the Stripe line',
            differingDueDate: 'Due date',
            dueDateHint:
              'Stripe gives this invoice a due date other than the one Kaiten issued it with. Kaiten counts a late payment from its own date.',
            kaitenDueAt: 'Due date in Kaiten',
            providerDueAt: 'Due date in Stripe',
          },
          Chain: {
            replaces: 'Replaces',
            replacedBy: 'Replaced by',
          },
          Stats: {
            total: 'Total',
            totalLines_one: '{{count}} line',
            totalLines_other: '{{count}} lines',
            due: 'Due',
            noDueDate: 'No due date',
            overdue_one: 'overdue for {{count}} day',
            overdue_other: 'overdue for {{count}} days',
            overdueToday: 'overdue since today',
            paid: 'Paid',
            writtenOff: 'Written off',
            voided: 'Voided',
            period: 'Service period',
            totalLinesDiscounted_one:
              '{{count}} line, after {{discount}} of discounts',
            totalLinesDiscounted_other:
              '{{count}} lines, after {{discount}} of discounts',
          },
          Hold: {
            title: 'Held: {{reason}}',
            description:
              'After the period closed, the usage journal behind this invoice failed a consistency check. The invoice was composed but not issued: billing does not bill an amount it cannot vouch for.',
            Columns: {
              meter: 'Meter',
              check: 'Check',
              expected: 'Expected',
              found: 'Found',
              reports: 'Reports',
              counter: 'Counter report',
            },
            atReport: 'At report {{seq}}',
            release_NOOP:
              'Releasing accepts the amounts as composed. The invoice is issued with no payment provider and waits in the handoff queue for your ERP.',
            release_STRIPE:
              'Releasing accepts the amounts as composed. The invoice is pushed to Stripe, which collects it.',
            recompose:
              'Recomposing composes the invoice again from the usage journal as it is now, under the provider the subscription uses now.',
          },
          Summary: {
            title: 'Summary',
            boundary: 'Boundary',
            provider: 'Provider',
            heldSince: 'Held since',
            issued: 'Issued',
            terms: 'Payment terms',
            termsValue_one: '{{count}} day',
            termsValue_other: '{{count}} days',
            due: 'Due',
            voidReason: 'Void reason',
            released: 'Hold released',
            releasedValue: '{{date}}, by a person, for this reason: {{reason}}',
            releasedAutomatically:
              '{{date}}, automatically: a later check found the usage journal sound',
          },
          Lines: {
            title: 'Lines',
            viewReports_one: 'View {{count}} usage report',
            viewReports_other: 'View {{count}} usage reports',
          },
          Handoff: {
            title: 'Handoff',
            waiting:
              'A job or the CLI takes it from the queue, books it and acknowledges it.',
            waiting_VOID:
              'This invoice is void and its handoff stays pending: the system that reads the queue sees it as void, and acknowledges it.',
            waiting_UNCOLLECTIBLE:
              'This invoice was written off and its handoff stays pending: the system that reads the queue sees it as written off, and acknowledges it.',
            status: 'Status',
            claims: 'Claims',
            leasedUntil: 'Reserved until',
            reference: 'ERP reference',
            noReference: 'Acknowledged without a reference',
            acknowledgedAt: 'Acknowledged',
          },
          Identity: {
            title: 'Billed to',
            description:
              'As it was when the invoice was composed. A rename since does not change it.',
            customer: 'Customer',
            instance: 'Instance',
            license: 'License',
            billingEmail: 'Billing e-mail',
            customerInvoices: 'Invoices of this customer',
            instanceInvoices: 'Invoices of this instance',
          },
          MarkPaid: {
            title: 'Mark as paid',
            description:
              'Record that this invoice was paid. Times are read as UTC.',
            descriptionPending:
              'Record that this invoice was paid. It also acknowledges the invoice in the handoff queue, under the reference you give.',
            reference: 'External reference',
            referenceHint:
              'The invoice’s number in your ERP, up to {{max}} characters. Optional.',
            paidAt: 'Paid at (UTC)',
            paidAtHint: 'Now or earlier. Leave it empty for now.',
            note: 'Note',
            noteHint:
              'For example the reference of the transfer. It is kept in the paid event only.',
            confirm: 'Mark as paid',
          },
          Release: {
            title: 'Release the hold',
            description:
              'Accept the amounts as composed, although the usage journal could not vouch for them. The invoice is then issued.',
            reason: 'Reason',
            reasonHint:
              'Why the amounts can be trusted. It is kept with your name in the audit trail.',
            effect_NOOP:
              'The invoice is issued with no payment provider and waits in the handoff queue for your ERP.',
            effect_STRIPE:
              'The invoice is pushed to Stripe, which collects it.',
            confirm: 'Release',
          },
          Recompose: {
            title: 'Recompose the invoice',
            descriptionHeld:
              'Compose this held draft again from the usage journal as it is now.',
            descriptionVoid:
              'Compose a replacement for the boundary this void invoice billed.',
            effectHeld:
              'The draft is rewritten in place. If the journal is sound, the invoice is issued under the provider the subscription uses now.',
            effectVoid:
              'The replacement is issued under the provider the subscription uses now, and this invoice points to it.',
            confirm: 'Recompose',
          },
          Void: {
            title: 'Void the invoice',
            descriptionNoop:
              'Voiding takes the invoice off the boundary it billed, which a recompose can then fill. A handoff still pending stays pending, with the void in its payload.',
            descriptionProvider:
              'The invoice is voided at your payment provider first, then here. This cannot be undone.',
            reason: 'Reason',
            confirm: 'Void invoice',
            PaidAtProvider: {
              title: 'Stripe reports this invoice as paid',
              description:
                'A paid invoice cannot be voided. Kaiten could not read the payment from Stripe just now: read the invoice again, and it will show as paid.',
              sync: 'Read it from Stripe',
              notVoided: 'Not voided: Stripe reports this invoice as paid.',
            },
          },
          VoidThenRecompose: {
            title: 'Void and recompose',
            description:
              'This invoice is not a held draft, so it cannot be edited: it is voided, and a replacement is composed from the usage journal as it is now. One reason covers both.',
            descriptionMismatch:
              'Stripe holds something other than what Kaiten composed. Kaiten is authoritative: the invoice is voided in Stripe and in Kaiten, and a replacement is composed from the usage journal as it is now, pushed to Stripe, checked again and collected in turn. One reason covers both.',
            confirm: 'Void and recompose',
          },
          WriteOff: {
            title: 'Write the invoice off',
            description:
              'Give up collecting this invoice. It becomes uncollectible, which is final. A handoff still pending stays pending.',
            reason: 'Reason',
            confirm: 'Write off',
          },
        },
        Drilldown: {
          subtitle: 'Usage behind a line of this invoice: {{invoice}}',
          backToInvoice: 'Back to the invoice',
          region: 'Usage reports of the line',
          export: 'Export CSV',
          loading: 'Loading the usage reports',
          Empty: {
            title: 'No usage reports',
            description:
              'No report was accepted during the period of this line.',
          },
          Summary: {
            title: 'This line',
            period: 'Service period',
            addon: 'Add-on',
            addonRemoved: '{{name}}, removed on {{date}}',
            measured: 'Measured quantity',
            billed: 'Billed quantity',
            saleUnit: 'Measured units per sale unit',
            windows: 'Reset windows',
            windowsValue_one: '{{count}} window',
            windowsValue_other: '{{count}} windows',
            windowsFloored_one:
              '{{count}} window had a negative movement and counted as 0',
            windowsFloored_other:
              '{{count}} windows had a negative movement and counted as 0',
            amount: 'Line amount',
          },
          lifetime: 'Whole lifetime',
          windowUsage_one: '{{count}} report · usage {{sum}}',
          windowUsage_other: '{{count}} reports · usage {{sum}}',
          windowOverage_one: '{{count}} report · overage {{sum}}',
          windowOverage_other: '{{count}} reports · overage {{sum}}',
          windowPartial_one: '{{count}} report so far · more to load',
          windowPartial_other: '{{count}} reports so far · more to load',
          loadMore: 'Load more reports',
          OutsideRetention: {
            title: 'The reports of this line are no longer kept',
            description:
              'The usage behind this line is older than the history your organization keeps. The invoice kept a fingerprint of it: which reports it was measured from, and what they sum to.',
            kept: 'What the invoice kept',
          },
        },
      },
      Handoff: {
        Columns: {
          issued: 'Issued',
          booked: 'Booked',
          claims: 'Claims',
        },
        claims_one: '{{count}} claim',
        claims_other: '{{count}} claims',
        reservedUntil: 'Reserved until {{date}}',
        noReference: 'No reference',
        acknowledge: 'Acknowledge',
        Empty: {
          pendingTitle: 'Nothing is waiting for your ERP',
          pendingDescription:
            'Invoices that no payment provider collects wait here until a job or a terminal takes them. To take them from a terminal, run:',
          acknowledgedTitle: 'Nothing acknowledged yet',
          acknowledgedDescription:
            'Invoices booked in your ERP appear here once they are acknowledged.',
          filteredTitle: 'No invoice matches these filters',
          filteredDescription: 'Clear the filters to see more.',
          clearFilters: 'Clear filters',
        },
        Acknowledge: {
          title: 'Acknowledge the invoice',
          description:
            'Record that your ERP booked this invoice. Do it only for an invoice you booked yourself: a job or the CLI acknowledges the ones it takes.',
          leased:
            'A consumer holds this invoice until {{date}}. Acknowledging it now may book it twice.',
          reference: 'External reference',
          referenceHint:
            'The invoice’s number in your ERP, up to {{max}} characters. Optional.',
          confirm: 'Acknowledge',
        },
        Toasts: {
          acknowledged: 'Invoice acknowledged',
        },
      },
    },
    Addons: {
      title: 'Add-ons',
      subtitle:
        'Extra quantities sold on top of a license: seats, instances, history.',
      PricingTypes: {
        FREE: 'Free',
        PAID: 'Paid',
        CUSTOM: 'Custom',
      },
      Lifecycle: {
        DRAFT: 'Draft',
        PUBLISHED: 'Published',
        ARCHIVED: 'Archived',
      },
      Public: {
        label: 'Public catalog',
        switchLabel: 'List {{name}} in the public catalog',
        badge: 'Public',
        listed: 'The add-on is listed in the public catalog',
        unlisted: 'The add-on is no longer listed in the public catalog',
      },
      List: {
        addonName: 'Add-on name',
        versionCount_one: '{{count}} version',
        versionCount_other: '{{count}} versions',
        defaultBadge: 'Default: {{version}}',
        newVersionButton: 'New Version',
        Empty: {
          title: 'No add-on yet',
          description:
            'An add-on is an extra quantity of an entitlement, sold per unit: seats, instances, history. Create one, give it entitlements and a price, say which licenses it fits, then publish it.',
        },
      },
      VersionsTable: {
        Columns: {
          versionName: 'Version name',
          version: 'Version',
          pricingType: 'Pricing',
          lifecycleState: 'State',
          default: 'Default',
          maxQuantity: 'Max quantity',
          actions: 'Actions',
        },
        default: 'Default',
        unbounded: 'Unbounded',
      },
      LifecycleActions: {
        publish: {
          label: 'Publish',
          title: 'Publish {{name}} v{{version}}?',
          description:
            'The version goes on sale: an instance on a license it fits can attach it, and it can be set as the default version of the add-on.',
          confirm: 'Publish',
          success: 'Version published',
          Notes: {
            prices:
              'Its prices cannot be edited: they can only be deprecated, and a price can still be added until an instance with a live subscription holds the version.',
            grants:
              'Its entitlements freeze as soon as an instance with a live subscription holds the version.',
            compatibility:
              'It is attachable only to the licenses it fits: a version that fits none is attachable to nothing.',
          },
        },
        archive: {
          label: 'Archive',
          title: 'Archive {{name}} v{{version}}?',
          description:
            'The version is withdrawn from sale: no instance can attach it any more. The instances that hold it keep it, and keep being billed for it. You can unarchive it later.',
          confirm: 'Archive',
          success: 'Version archived',
        },
        unarchive: {
          label: 'Unarchive',
          title: 'Unarchive {{name}} v{{version}}?',
          description:
            'The version goes back on sale: instances can attach it again, and it can be set as the default version of the add-on again.',
          confirm: 'Unarchive',
          success: 'Version unarchived',
        },
        archiveDefaultUnavailable:
          'The default version cannot be archived. Set another version as the default, or unset the default, first.',
      },
      DefaultActions: {
        set: 'Set as default',
        unset: 'Unset default',
        setUnavailable: 'Only a published version can be set as the default',
        setSuccess: 'Default version updated',
        unsetSuccess: 'Default version unset',
      },
      DeleteDraft: {
        label: 'Delete',
        title: 'Delete the draft {{name}} v{{version}}?',
        description:
          'The draft, its prices, the licenses it fits and the entitlements it grants are deleted. Its active metered prices are deprecated first, since the API keeps the grants they measure until then. It was never on sale, so no customer loses it. A version that was ever attached to an instance is history and cannot be deleted: archive it instead.',
        confirm: 'Delete',
        success: 'Draft deleted',
      },
      Form: {
        titleNew: 'New add-on',
        titleNewVersion: 'New version of {{name}}',
        titleUpdate: 'Edit add-on',
        descriptionNew:
          'A new add-on starts with its first version, created as a draft.',
        descriptionNewVersion:
          'A new version starts empty: nothing is copied from the previous one. Give it its entitlements, its prices and the licenses it fits, then publish it.',
        descriptionEdit:
          '{{name}}, version {{version}}. How it is sold and its entitlements are not changed here.',
        createButton: 'Create add-on',
        updateButton: 'Save',
        Labels: {
          name: 'Name',
          slug: 'Slug',
          description: 'Description',
          pricingType: 'Pricing',
          versionName: 'Version name',
          maxQuantity: 'Maximum quantity',
          createAsDraft: 'Create as a draft',
        },
        Placeholders: {
          name: 'Extra seats',
          slug: 'extra-seats',
          description: 'Five more seats per unit',
          versionName: 'Version - 1',
          maxQuantity: 'Unbounded',
        },
        Descriptions: {
          name: 'What the add-on is called. Every version of the add-on shares it.',
          slug: 'Auto-generated — edit to set a custom one.',
          description: 'What one unit gives an instance, in a sentence.',
          pricingType:
            'Free and paid add-ons can be attached by anyone who may; a paid one needs a default price for the billing period of the subscription it is attached to. A custom one is sold on request.',
          versionName: 'Left empty, the version is called “Version - {n}”.',
          maxQuantity:
            'The most units an instance can hold. Leave empty for no maximum.',
          createAsDraft:
            'A draft is not on sale yet: it can be given its entitlements, its prices and the licenses it fits before it is. An instance nobody bills can still try it.',
        },
        Errors: {
          name: 'Name is required',
          maxQuantity:
            'Enter a whole number of units, 1 or more, or leave it empty for no maximum.',
        },
        Toasts: {
          created: 'Add-on created',
          updated: 'Add-on updated',
        },
      },
      Detail: {
        Tabs: {
          overview: 'Overview',
          entitlements: 'Entitlements',
          prices: 'Prices',
          compatibility: 'Compatible licenses',
        },
        cardTitle: 'Add-on details',
        cardDescription:
          'How this version is called and sold. Its entitlements, prices and compatible licenses are the tabs beside.',
        defaultBadge: 'Default version',
        unbounded: 'Unbounded',
        Fields: {
          name: 'Name',
          version: 'Version',
          lifecycleState: 'State',
          default: 'Default',
          pricingType: 'Pricing',
          maxQuantity: 'Max quantity',
          description: 'Description',
        },
      },
      Freeze: {
        billed: {
          title: 'This version is held by a billed instance',
          description:
            'An instance with a live subscription holds this version, so its entitlements and prices are frozen: changing them would change a contract already sold. Create a new version to change what is sold. It starts empty: give it its entitlements, its prices and the licenses it fits, then move the instances onto it by detaching this version and attaching the new one.',
        },
        archived: {
          title: 'This version takes no new price',
          description:
            'A version withdrawn from sale takes no new price. Create a new version to change what is sold. It starts empty: give it its entitlements, its prices and the licenses it fits.',
        },
        createNewVersion: 'Create a new version',
      },
      Grants: {
        title: 'Entitlements',
        tabDescription:
          'What one unit of this add-on grants an instance that holds it. A number counts once per unit of quantity.',
        Actions: {
          add: 'Add entitlement',
          edit: 'Edit',
          editAria: 'Edit {{name}}',
          remove: 'Remove',
          removeAria: 'Remove {{name}}',
        },
        Notes: {
          DRAFT:
            'The entitlements of a draft can be changed until an instance with a live subscription holds the version.',
          PUBLISHED:
            'The entitlements of a published version freeze as soon as an instance with a live subscription holds it. Until then they can still be changed.',
          ARCHIVED:
            'This version is withdrawn from sale. The instances that hold it keep its entitlements; to change what is sold, create a new version.',
        },
        Table: {
          Columns: {
            entitlement: 'Entitlement',
            type: 'Type',
            value: 'Grants',
            behavior: 'Combines',
            overage: 'Overage allowance',
          },
          empty: 'This version grants nothing yet.',
        },
        Values: {
          unlimited: 'Unlimited',
          perUnit: '{{value}} per unit',
          enabled: 'Enabled',
          disabled: 'Disabled',
          configured: 'Configured',
        },
        Behaviors: {
          ADD: {
            label: 'Add',
            blurb:
              'Adds value × quantity to what the license grants: 5 seats per unit, 3 units, 15 more seats.',
          },
          OVERRIDE: {
            label: 'Override',
            blurb:
              'Replaces the license’s value with value × quantity. Among several overrides the largest wins, whatever the order they were attached in.',
          },
          MAX: {
            label: 'Maximum',
            blurb:
              'Keeps the larger of the license’s value and value × quantity.',
          },
        },
        Overage: {
          inherit: 'Inherit',
          hard: 'Hard limit',
          soft: '+{{percent}}%',
          unlimited: 'Unlimited',
        },
        OverageWarning: {
          message:
            'This add-on allows an overage of {{addon}}%, and {{name}} allows {{license}}%.',
          consequence:
            'On every instance that attaches the add-on, its percentage replaces the license’s: usage is refused sooner than the license says.',
        },
        ValueWarning: {
          message:
            'As an override, {{value}} per unit replaces the {{license}} that {{name}} grants with a lower value.',
          consequence:
            'On every instance of that license that attaches the add-on, the limit falls below what the license grants. The API accepts it; check that it is what you mean.',
        },
        Remove: {
          title: 'Remove {{name}} from this add-on?',
          description:
            'Instances that hold this version lose the entitlement at once.',
          confirm: 'Remove',
        },
        Form: {
          titleNew: 'Add entitlement',
          titleEdit: 'Edit entitlement',
          description: 'What one unit of {{name}} grants.',
          create: 'Add entitlement',
          update: 'Save entitlement',
          Labels: {
            entitlement: 'Entitlement',
            number: 'Value per unit',
            unlimited: 'Unlimited',
            behavior: 'Combines with the license',
            overage: 'Overage allowance (%)',
            boolean: 'Enabled',
            config: 'Configuration (JSON)',
          },
          Descriptions: {
            entitlement: 'A version grants an entitlement once.',
            number:
              'What one unit of quantity grants. Three units of a value of 5 grant 15. A value of 0 is ignored: it changes nothing.',
            behavior:
              'How the value times the quantity combines with the license’s grant of the same entitlement: added to it, replacing it, or the larger of the two.',
            overage:
              'Leave empty to inherit the license’s allowance. Set, it replaces the license’s on every instance that attaches the add-on: 0 is a hard limit.',
            boolean: 'A flag combines by OR with the license’s.',
            config:
              'A configuration replaces the license’s. The add-on attached last wins.',
          },
          Placeholders: {
            entitlement: 'Select an entitlement',
            number: '5',
            overage: 'Inherit',
          },
          Errors: {
            entitlement: 'Pick an entitlement.',
            number: 'Enter a whole number, 0 or more, or choose unlimited.',
            overage: 'Enter a whole percentage, 0 or more, or leave it empty.',
            config: 'Enter a JSON object.',
          },
        },
        Toasts: {
          assigned: 'Entitlement added',
          updated: 'Entitlement updated',
          unassigned: 'Entitlement removed',
        },
      },
      Prices: {
        title: 'Prices',
        tabDescription:
          'What this add-on is billed: a flat fee per unit and billing period, and what its usage is rated at. A price is never edited: change it with a new price and the deprecation of the old one.',
        defaultBadge: 'Default',
        deprecatedOn: 'Deprecated {{date}}',
        Notes: {
          DRAFT:
            'The prices of a draft can be added to and deprecated until an instance with a live subscription holds the version.',
          PUBLISHED:
            'A price can still be added until an instance with a live subscription holds this version. A price is never edited, and the default price of a period cannot be deprecated: to change it, add a price and make it the default.',
          ARCHIVED:
            'This version is withdrawn from sale and takes no new price. The instances that hold it keep being billed from its prices.',
        },
        Slots: {
          label: 'Default price of each billing period',
          title: 'Default price of each billing period',
          missing:
            'No default price: this add-on cannot be attached to a subscription with {{period}} billing.',
          noDefault:
            'Priced, but no price is the default: this add-on cannot be attached to a subscription with {{period}} billing.',
        },
        Actions: {
          add: 'Add price',
          deprecate: 'Deprecate',
          deprecateAria: 'Deprecate {{label}}',
          deprecateDefaultHint:
            'The default price of a period bills every instance that holds this version. Retire it through a new add-on version, or add a price and make it the default.',
        },
        Table: {
          Columns: {
            price: 'Price',
            shape: 'Shape',
            meter: 'Meters',
            amount: 'Amount per unit',
            billed: 'Billed',
            status: 'Status',
          },
          empty: 'This version has no price yet.',
        },
        Drawer: {
          titleNew: 'New price',
          description:
            '{{name}}, version {{version}}. A price becomes one line of an invoice.',
          create: 'Create price',
        },
        Form: {
          Labels: {
            model: 'Shape',
            period: 'Billing period',
            timing: 'Billing timing',
            currency: 'Currency',
            amount: 'Amount per unit',
            amountPer: 'Amount per {{unit}}',
            label: 'Label on the invoice',
            isDefault: 'Default price of this period',
          },
          Descriptions: {
            timingLocked:
              'A metered price is always billed in arrears: usage cannot be billed before it happens.',
            period: 'How often the fee is billed.',
            currency:
              'A version bills in one currency, fixed by its first price.',
            currencyLocked:
              'This version bills in {{currency}}, fixed by its first price.',
            amount:
              'Billed for each unit held, per period. Type the amount in the currency’s own unit (for example 10.00).',
            amountUsage:
              'Applied from the first unit measured while the add-on is held. Type the amount in the currency’s own unit (for example 0.075).',
            amountOverage:
              'Applied only to the units above the limit the instance holds, its license and its add-ons together. Type the amount in the currency’s own unit (for example 0.075).',
            label:
              'The name of the invoice line. Left empty, Kaiten derives one.',
            isDefault:
              'The default price of a period is the one that bills the instances that hold this version on a subscription of that period. A period has one.',
          },
          Placeholders: {
            currency: 'Select a currency',
            currencySearch: 'Search a currency',
            amount: '0.00',
            label: 'Extra seat, monthly',
          },
          livePreview: 'Reads as {{price}} per unit',
          livePreviewMetered: 'Reads as {{price}}',
          Errors: {
            label: 'The label is at most 200 characters.',
            currency: 'Pick a currency Kaiten supports.',
            amount:
              'Enter a valid amount: zero or more, with at most 12 decimals past the currency’s own and 12 digits in its smallest unit.',
            meter: 'Pick the entitlement this price measures.',
          },
        },
        ReplaceDefault: {
          title: 'Replace the default {{period}} price?',
          description:
            'This price becomes the one that bills {{period}} subscriptions, in place of “{{label}}” ({{price}}). The old price stays listed and active, and can be deprecated once it is no longer the default.',
          confirm: 'Replace the default',
        },
        Deprecate: {
          title: 'Deprecate “{{label}}”?',
          description:
            'Instances already billed from this price keep being billed from it. It is no longer offered. This cannot be undone.',
          descriptionMetered:
            'This price produces no line from the next invoice on, and it is no longer offered. What it already billed is unchanged. This cannot be undone.',
          confirm: 'Deprecate',
        },
        Toasts: {
          created: 'Price created',
          deprecated: 'Price deprecated',
        },
      },
      Compatibility: {
        title: 'Compatible licenses',
        description:
          'An instance can attach this version only when its license is one of these. Every version of a license counts, so a new license version never leaves the add-on orphaned.',
        listLabel: 'Compatible licenses',
        noFamilies: 'There is no license yet.',
        Empty: {
          title: 'Attachable to nothing',
          description:
            'No license is compatible, so no instance can attach this version. Publishing it is allowed: pick the licenses it fits.',
        },
      },
    },
    Vouchers: {
      title: 'Vouchers',
      subtitle:
        'Codes that give an instance a discount on its invoices or a boost of its entitlements.',
      Actions: {
        addBoost: 'Add a boost',
        publish: {
          label: 'Publish',
          title: 'Publish {{name}}?',
          description:
            'Publishing makes the code redeemable. A published voucher keeps its offer: only its name, description, end date and maximum number of redemptions can change afterwards.',
          confirm: 'Publish',
          success: 'Voucher published',
        },
        archive: {
          label: 'Archive',
          title: 'Archive {{name}}?',
          description:
            'No instance can redeem the code any more. Redemptions already made keep applying, and the voucher stays readable.',
          confirm: 'Archive',
          success: 'Voucher archived',
        },
      },
      Code: {
        label: 'Voucher code',
        copy: 'Copy the code',
        copied: 'Code copied',
        copyFailed: 'The code could not be copied',
      },
      Detail: {
        subtitle: 'Code ending in {{hint}}',
        Offer: {
          title: 'What it does',
          description: 'In plain language, as you could send it with the code.',
        },
        Details: {
          title: 'Details',
          description: 'Its state, its redemptions and when it was made.',
        },
        Fields: {
          description: 'Description',
          type: 'Kind',
          status: 'Status',
          redeemed: 'Redeemed',
          created: 'Created',
          updated: 'Last changed',
        },
        Redemptions: {
          description: 'The instances that redeemed this voucher.',
          empty: 'No instance has redeemed this voucher yet.',
        },
      },
      Edit: {
        title: 'Edit {{name}}',
        description:
          'A published voucher keeps its offer. Its name, description, end date and maximum number of redemptions can change.',
        save: 'Save',
        saved: 'Voucher saved',
        Descriptions: {
          expiresAt: 'Date and time in UTC. Leave empty for no end date.',
          maxRedemptions_one:
            'Leave empty for no limit. It cannot be below the {{count}} redemption already made.',
          maxRedemptions_other:
            'Leave empty for no limit. It cannot be below the {{count}} redemptions already made.',
        },
        Errors: {
          name: 'Enter a name',
          nameTooLong: 'A name has at most 200 characters',
          descriptionTooLong: 'A description has at most 2000 characters',
          date: 'Enter a valid date and time',
          maxRedemptions:
            'Enter a whole number from 1, or leave empty for no limit',
          belowCount:
            'The voucher has already been redeemed more times than that',
        },
      },
      List: {
        new: 'New voucher',
        Columns: {
          name: 'Name',
          code: 'Code',
          type: 'Kind',
          status: 'Status',
          redeemed: 'Redeemed',
          expires: 'Valid until',
          customer: 'Customer',
        },
        Empty: {
          title: 'No voucher yet',
          description:
            'A voucher is a code that gives an instance a discount on its invoices or a boost of its entitlements. Make one, then give its code to a customer.',
          filteredTitle: 'No voucher matches',
          filteredDescription:
            'No voucher matches this search or these filters.',
        },
        Filters: {
          search: 'Search',
          searchPlaceholder: 'Name, code or customer',
          status: 'Status',
          type: 'Kind',
          clear: 'Clear the filters',
        },
        anyCustomer: 'Any customer',
        codeHint: 'ends in {{hint}}',
        noEnd: 'No end date',
        redeemed: '{{count}} of {{max}}',
        redeemedUnbounded: '{{count}} (no limit)',
        startsOn: 'Starts {{date}}',
      },
      Published: {
        title: 'Voucher published',
        subtitle: '{{name}} can now be redeemed.',
        codeTitle: 'Its code',
        codeDescription:
          'Copy it and give it to the customer. Whoever has the code can redeem the offer.',
        codeHidden:
          'The code ends in {{hint}}. It is only shown to sessions that can read vouchers.',
        summaryTitle: 'What it does',
        summaryDescription: 'In plain language, to send with the code.',
        boostTitle: 'Add a boost for the same offer',
        boostDescription:
          'Start a boost that lasts as long as this discount, with the same conditions and limits. You choose which entitlements it changes.',
        boostAction: 'Add a boost',
        another: 'Make another voucher',
        view: 'View the voucher',
      },
      References: {
        license: '{{name}} v{{version}}',
        draft: '{{label}} (draft)',
        archived: '{{label}} (archived)',
        unknown: 'a version that is not listed',
      },
      Review: {
        name: 'Name',
        code: 'Code',
        codeGenerated: 'A code is generated when you publish',
        summary: 'The voucher in plain language',
        publishNote:
          'Publishing makes the code redeemable. Save it as a draft instead to keep working on it: a draft cannot be redeemed.',
        unlimited: 'it has no limit on the number of redemptions',
        limited_one: 'it can be redeemed once',
        limited_other: 'it can be redeemed {{count}} times',
        reservedFor: 'it is reserved for {{customer}}',
        anyCustomer: 'any customer can redeem it, once per instance',
        licenses: 'it applies only to instances on {{licenses}}',
        addons: 'it applies only to instances that hold {{addons}}',
        licensesAndAddons:
          'it applies only to instances on {{licenses}} that hold {{addons}}',
        window: 'it can be redeemed from {{from}} to {{to}}',
        until: 'it can be redeemed until {{date}}',
        from: 'it can be redeemed from {{date}}',
        noWindow: 'it has no end date',
        firstTimeOnly:
          'only customers that have not paid an invoice yet can redeem it',
        annualOnly: 'only instances with an annual subscription can redeem it',
        minimumAmount:
          'the base price of the subscription must be at least {{amount}}',
      },
      Wizard: {
        title: 'New voucher',
        titleDraft: 'Finish the draft',
        subtitle:
          'Say what it offers, who can redeem it and how often, then review it in plain language before it is published.',
        boostName: '{{name}} (boost)',
        draftKept:
          'The voucher was saved as a draft. Sending again replaces it with what is on this page and publishes it.',
        anyCustomer: 'Any customer',
        unlimitedNote:
          'No limit on this entitlement while the voucher applies.',
        addChange: 'Add a change',
        removeChange: 'Remove change {{position}}',
        Steps: {
          type: 'Kind',
          offer: 'Offer',
          eligibility: 'Who and when',
          review: 'Review',
        },
        Buttons: {
          back: 'Back',
          next: 'Next',
          saveDraft: 'Save as a draft',
          publish: 'Publish',
        },
        Toasts: {
          draftSaved: 'Draft saved',
          published: 'Voucher published',
        },
        Type: {
          label: 'What kind of voucher is it?',
          later: 'Available in a later version',
          FLAG_GRANT: 'Feature grant',
          COMPOSITE: 'Bundle',
          Detail: {
            PRICE:
              'A percentage or an amount off the invoices of the instance.',
            ENTITLEMENT_BOOST:
              'Sets, adds to, multiplies or lifts the limit of numeric entitlements.',
          },
        },
        Labels: {
          name: 'Name',
          description: 'Description',
          discountType: 'How is the discount worked out?',
          percentage: 'Percentage',
          currency: 'Currency',
          amount: 'Amount',
          appliesTo: 'What does it apply to?',
          prices: 'Prices',
          grants: 'What it changes',
          entitlement: 'Entitlement',
          modifier: 'Change',
          value: 'Value',
          duration: 'How long does it last?',
          durationInInvoices: 'Number of invoices',
          durationInPeriods: 'Number of billing periods',
          code: 'Custom code',
          restrictedCustomer: 'Reserved for',
          maxRedemptions: 'Maximum number of redemptions',
          startsAt: 'Can be redeemed from',
          expiresAt: 'Can be redeemed until',
          licenseVersions: 'License versions',
          addonVersions: 'Add-on versions',
          firstTimeOnly: 'First-time customers only',
          annualOnly: 'Annual subscriptions only',
          minimumCurrency: 'Currency of the minimum',
          minimumAmount: 'Minimum base price',
        },
        Descriptions: {
          name: 'What you call it in the console; customers do not see it.',
          description: 'Optional. What it is for, in a few words.',
          percentage:
            'More than 0 and up to 100. Decimals are accepted, such as 12.5.',
          currency:
            'A fixed amount only applies to subscriptions billed in this currency.',
          amount: 'In the currency, in major units: 50.00 for fifty dollars.',
          prices:
            'Tick the prices the discount applies to. The prices of a version that is no longer on sale are listed too.',
          grants:
            'Each line changes one numeric entitlement. An entitlement can be changed once.',
          durationInInvoices: 'How many invoices the discount applies to.',
          durationInPeriods:
            'How many billing periods the boost lasts. A month, a quarter or a year, as the subscription is billed.',
          code: 'Leave empty to have a long code generated. Otherwise 8 to 64 letters, digits, dashes or underscores; case and dashes do not matter when it is redeemed.',
          restrictedCustomer:
            'Only the instances of this customer can redeem it.',
          restrictedCustomerSlug:
            'The slug of the customer. The customers could not be listed with this session.',
          maxRedemptions:
            'Leave empty for no limit. Each instance can redeem it once.',
          startsAt:
            'Date and time in UTC. Leave empty to start as soon as it is published.',
          expiresAt: 'Date and time in UTC. Leave empty for no end date.',
          licenseVersions:
            'Only instances on one of the ticked versions can redeem it.',
          addonVersions:
            'Only instances that hold one of the ticked versions can redeem it.',
          firstTimeOnly:
            'Only customers none of whose instances has paid an invoice.',
          annualOnly: 'Only instances with a live annual subscription.',
          minimumCurrency:
            'The minimum is compared with the base price of the subscription, in this currency.',
          minimumAmount:
            'Optional. The subscription must cost at least this much.',
        },
        Placeholders: {
          name: 'Launch discount',
          percentage: '20',
          currency: 'Choose a currency',
          currencySearch: 'Search a currency',
          amount: '50.00',
          entitlement: 'Choose an entitlement',
          entitlementSearch: 'Search an entitlement',
          value: '50000',
          code: 'LAUNCH-20-OFF',
          customerSearch: 'Search a customer',
        },
        DiscountType: {
          PERCENTAGE: 'A percentage',
          FIXED_AMOUNT: 'A fixed amount',
        },
        AppliesTo: {
          LICENSE_BASE: 'The base price',
          ADDONS: 'The add-ons',
          BOTH: 'Both',
          SELECTED_PRICES: 'Chosen prices',
          Blurb: {
            LICENSE_BASE: 'The fee of the license, before add-ons and usage.',
            ADDONS:
              'What the add-ons an instance holds cost, their usage included.',
            BOTH: 'The license fee and the add-ons together.',
            SELECTED_PRICES: 'Only the prices you tick below.',
          },
        },
        Prices: {
          label: 'Prices the discount applies to',
          loading: 'Loading the prices',
          none: 'No price to choose from.',
          deprecated: '{{amount}} · deprecated',
        },
        Modifier: {
          SET: 'Set to',
          ADD: 'Add',
          MULTIPLY: 'Multiply by',
          UNLIMITED: 'Make unlimited',
        },
        Duration: {
          ONE_TIME: 'Once',
          REPEATING: 'A number of times',
          FOREVER: 'With no end',
          Blurb: {
            priceONE_TIME:
              'The discount applies to one invoice: the first one issued after the code is redeemed.',
            priceREPEATING:
              'The discount applies to a number of invoices, counted in invoices and not in months.',
            priceFOREVER:
              'The discount applies to every invoice until the redemption is revoked.',
            boostONE_TIME:
              'The boost lasts one billing period from the redemption.',
            boostREPEATING:
              'The boost lasts a number of billing periods, counted in periods and not in invoices.',
            boostFOREVER:
              'The boost has no end until the redemption is revoked.',
          },
        },
        Sections: {
          code: 'Code',
          customer: 'Customer',
          customerDescription:
            'Reserve the voucher for one customer, or let any customer redeem it.',
          limits: 'Limits',
          limitsDescription:
            'How many times it can be redeemed, and when. Dates are in UTC.',
          versions: 'License and add-on versions',
          versionsDescription:
            'Limit the voucher to instances on some versions. Nothing ticked is no limit.',
          conditions: 'Conditions',
          conditionsDescription:
            'What an instance must meet to redeem the voucher.',
        },
        WeakCode: {
          title: 'A short code can be guessed',
          description:
            'Add a maximum number of redemptions or an end date, or leave the code empty to have a long one generated.',
        },
        BelowLicense: {
          message:
            'This boost sets {{entitlement}} to {{value}}, and {{name}} grants {{license}}.',
          consequence:
            'On an instance on that license, redeeming it lowers the limit for as long as the boost applies. The API accepts it; check that it is what you mean.',
        },
        Checklist: {
          loading: 'Loading',
          notAllowed:
            'This session cannot list them. What is already ticked stays.',
        },
        Errors: {
          name: 'Enter a name',
          nameTooLong: 'A name has at most 200 characters',
          descriptionTooLong: 'A description has at most 2000 characters',
          percentage: 'Enter a percentage above 0 and up to 100',
          currency: 'Currency required',
          amount:
            'Enter an amount above 0, with no more decimals than the currency has',
          prices: 'Tick at least one price',
          durationInPeriods: 'Enter a whole number from 1',
          grants: 'Add at least one change',
          entitlement: 'Choose an entitlement',
          duplicate: 'This entitlement is already changed by another line',
          setValue: 'Enter a number, 0 or more',
          positiveValue: 'Enter a number above 0',
          code: 'Use 8 to 64 letters, digits, dashes or underscores, or leave it empty',
          minimumAmount:
            'Enter an amount, with no more decimals than the currency has',
          minimumAmountPositive:
            'Enter an amount above 0, or leave it empty for no minimum',
          date: 'Enter a valid date and time',
          window: 'The end must be after the start',
          maxRedemptions:
            'Enter a whole number from 1, or leave empty for no limit',
        },
      },
    },
    Notifications: {
      title: 'Notifications',
      subtitle: 'Everything that happened across your organization.',
      markAllRead: 'Mark all as read',
      preferences: 'Preferences',
      tabs: {
        all: 'All',
        unread: 'Unread',
        unreadWithCount_one: 'Unread ({{count}})',
        unreadWithCount_other: 'Unread ({{count}})',
        label: 'Filter by status',
      },
      item: {
        unread: 'Unread',
        read: 'Read',
      },
      table: {
        event: 'Event',
        status: 'Status',
        time: 'Time',
      },
      filters: {
        objectType: 'Object',
        objectTypes: {
          instance: 'Instance',
          customer: 'Customer',
          release: 'Release',
          deployment_zone: 'Deployment zone',
          component: 'Component',
          license: 'License',
          token: 'Token',
        },
      },
      bell: {
        label: 'Notifications',
        labelUnread_one: 'Notifications, {{count}} unread',
        labelUnread_other: 'Notifications, {{count}} unread',
        unreadBadge_one: '{{count}} unread',
        unreadBadge_other: '{{count}} unread',
        viewAll: 'View all notifications',
      },
      feed: {
        empty: "You're all caught up",
        emptyDescription: 'New notifications will appear here.',
        emptyUnread: 'No unread notifications',
        emptyUnreadDescription: 'Everything has been read.',
        emptyFiltered: 'No notifications match these filters',
        emptyFilteredDescription:
          'Try another object type, or reset the filters.',
        error: 'Notifications could not be loaded.',
        loadMore: 'Load more',
        today: 'Today',
        yesterday: 'Yesterday',
        eventsCount_one: '{{count}} notification',
        eventsCount_other: '{{count}} notifications',
      },
    },
    AuditTrail: {
      title: 'Audit trail',
      subtitle: 'A reverse-chronological feed of events across all instances.',
      autoRefresh: 'Auto-refreshes',
      export: 'Export',
      exported_one: '{{count}} event exported (CSV)',
      exported_other: '{{count}} events exported (CSV)',
      loadMore: 'Load older events',
      stats: {
        totalEvents: 'Total events',
        latestEvents: 'Latest {{count}} events',
        read: 'Reads',
        accepted: 'Accepted',
        rejected: 'Rejected',
        warnings: 'Warnings',
        today: 'Today',
      },
      table: {
        title: 'Event log',
        description: 'Events across all instances, newest first.',
        searchPlaceholder: 'Search by event, instance, customer or actor…',
        empty: 'No audit trail entries found',
        actions: {
          viewDetails: 'View details',
        },
        headers: {
          event: 'Event',
          instance: 'Instance',
          customer: 'Customer',
          actor: 'Actor',
          status: 'Status',
          timestamp: 'Time',
        },
        filters: {
          allEvents: 'All events',
          allInstances: 'All instances',
          allCustomers: 'All customers',
          allStatuses: 'All statuses',
          accepted: 'Accepted',
          read: 'Read',
          rejected: 'Rejected',
          clear: 'Clear filters',
          eventFilterLabel: 'Filter by event',
          instanceFilterLabel: 'Filter by instance',
          customerFilterLabel: 'Filter by customer',
          statusFilterLabel: 'Filter by status',
          all: 'All',
          warning: 'Warning',
          eventType: 'Event type',
          shownOfTotal: '{{shown}} of {{total}}',
          resultsCount_one: '{{count}} result',
          resultsCount_other: '{{count}} results',
        },
        range: {
          label: 'Filter by time range',
          last24h: '24h',
          last7d: '7 days',
          last30d: '30 days',
          all: 'All time',
        },
      },
      detail: {
        eventId: 'Event ID',
        eventType: 'Event type',
        status: 'Status',
        timestamp: 'Timestamp',
        instance: 'Instance',
        customer: 'Customer',
        actor: 'Actor',
        fullPayload: 'Full payload',
      },
      feed: {
        today: 'Today',
        yesterday: 'Yesterday',
        eventsCount_one: '{{count}} event',
        eventsCount_other: '{{count}} events',
      },
      Error: {
        title: 'Unable to load audit trail',
        description: 'The audit trail could not be loaded right now.',
      },
    },
    Access: {
      readOnlyAccess:
        'Read-only: you need Users write access and sufficient permissions to edit this user or role.',
      grantAdministrator: 'Grant administrator access',
      grantAdministratorDescription:
        'Add another administrator who can manage users and roles independently. Your own administrator access is kept.',
      singleAdministrator: 'Only one administrator',
      singleAdministratorDescription:
        'Avoid a single point of failure: open another enabled user and grant Administrator access. All administrators can appoint others.',

      requestFailed: 'Unable to save changes',
      fullAdministrator: 'Full administrator access',
      effectiveAccess: 'Effective resource access',
      inherited: 'From roles',
      direct: 'Direct grant',
      noResourceAccess: 'No resource access granted',
      rolesAdded: 'Roles added',
      rolesRemoved: 'Roles removed',
      directScopesChanged:
        'Direct scopes: {{added}} added, {{removed}} removed',
      discard: 'Discard changes',
      discardDescription:
        'Unsaved profile or access changes will be lost. Saved changes are kept.',
      roleSaveImpact: 'Changes affect {{count}} assigned users',

      errors: {
        LastAdministrator:
          'The last administrator cannot be disabled or lose the Administrator role. Assign another administrator first.',
        RoleInUse:
          'This role is still assigned to users. Remove those assignments before deleting it.',
        BuiltInRole: 'Built-in roles cannot be edited or deleted.',
        InvalidAuthorization:
          'The role or scope selection is invalid. Refresh and review the available access.',
      },
      title: 'Users & roles',
      subtitle:
        'Manage people, group scopes into roles, and control organization access.',
      cardDescription:
        'Manage user profiles, reusable roles and access to your organization.',
      manageAccess: 'Manage users & roles',
      users: 'Users',
      roles: 'Roles',
      user: 'User',
      role: 'Role',
      you: 'You',
      name: 'Name',
      email: 'Email',
      description: 'Description',
      identity: 'Identity provider ID',
      status: 'Status',
      enabled: 'Enabled',
      disabled: 'Disabled',
      allStatuses: 'All statuses',
      searchUsers: 'Search users',
      searchRoles: 'Search roles',
      manage: 'Manage',
      edit: 'Edit',
      view: 'View',
      manageNamedUser: 'Manage {{name}}',
      manageNamedRole: 'Manage role {{name}}',
      noRoles: 'No roles assigned',
      scopeCount: '{{count}} scopes',
      effectiveScopes: '{{count}} effective scopes from roles and overrides',
      overrides: 'Direct scopes',
      scopeOverrides: 'Advanced: direct scope overrides',
      overridesExplanation:
        'Direct scopes add to assigned roles. None removes only the direct grant; it does not revoke access inherited from a role.',
      assignedUsers: 'Assigned users',
      access: 'Access',
      administrator: 'Administrator',
      builtIn: 'Built-in',
      adminExplanation:
        'Users read access lets you view users and roles. Users write access lets you manage them. Roles group scopes, and you can only delegate access you already hold.',
      accessDenied: 'User directory access required',
      accessDeniedDescription:
        'Your current access was checked with Kaiten Core. Ask someone with Users write access to manage users or assign roles.',
      loading: 'Checking access and loading users…',
      notFound:
        'This user or role no longer exists. Refresh the list and try again.',
      resourceAccess: 'Access to {{resource}}',
      profile: 'Profile',
      saveProfile: 'Save profile',
      profileSaved: 'Profile saved',
      userEditorDescription:
        'Name and email are shared across organizations. Roles and access apply only to this organization.',
      selfProtection:
        'You cannot disable your own account. The last administrator must always retain access.',
      enableAccount: 'Account enabled',
      saveAccess: 'Save access',
      saving: 'Saving…',
      accessSaved: 'Access updated',
      confirm: 'Confirm',
      confirmAccess: 'Update user access?',
      confirmEnable: 'Re-enable this user?',
      confirmDisable: 'Disable this user?',
      accessImpact:
        'Access for {{name}} will change immediately. Existing sessions use the updated authorization.',
      disableImpact:
        '{{name}} will lose access immediately, including existing sessions. Their profile and assigned roles are retained; you can re-enable them later.',
      disableUser: 'Disable user',
      enableUser: 'Re-enable user',
      discardChanges: 'Discard unsaved changes?',
      createRole: 'Create role',
      editRole: 'Role details',
      roleEditorDescription:
        'A role is a named, reusable group of resource scopes. Assign it to users from their access editor.',
      slug: 'Role identifier',
      slugExplanation:
        'Lowercase letters, numbers and hyphens. Cannot be changed after creation.',
      permissions: 'Resource scopes',
      rolePermissionsExplanation:
        'Read & write includes read. Changes apply immediately to every user assigned this role.',
      builtInExplanation:
        'Built-in roles are managed by Kaiten and cannot be edited or deleted.',
      deleteRoleExplanation:
        '{{count}} users assigned. A role can only be deleted when no users are assigned.',
      deleteRole: 'Delete role',
      confirmDeleteRole: 'Delete this role?',
      deleteRoleImpact:
        'The role {{name}} will be permanently deleted. This cannot be undone.',
      roleSaved: 'Role saved',
      roleDeleted: 'Role deleted',
      levels: {
        none: 'None',
        read: 'Read',
        write: 'Read & write',
      },
      validation: {
        name: 'Enter a name.',
        email: 'Enter a valid email address.',
        slug: 'Use lowercase letters, numbers and hyphens.',
      },
      resources: {
        components: 'Components',
        customers: 'Customers',
        deployment_zones: 'Deployment zones',
        entitlements: 'Entitlements',
        feature_flags: 'Feature flags',
        instances: 'Instances',
        licenses: 'Licenses',
        metadata_fields: 'Metadata fields',
        notifications: 'Notifications',
        organizations: 'Organizations',
        profile: 'Profile',
        releases: 'Releases',
        tokens: 'Tokens',
        users: 'Users',
        webhooks: 'Webhooks',
      },
      local: {
        checking: 'Checking access',
        unavailable: 'Access unavailable',
        administrator: 'Administrator',
        member: 'Member',
        description: 'Current access verified by Kaiten Core',
      },
    },
    Settings: {
      title: 'Settings',
      subtitle:
        'Your organization’s settings, and what this browser remembers.',
      groups: {
        organization: 'Organization',
        browser: 'This browser',
      },
      Notifications: {
        title: 'Notifications',
        subtitle: 'Choose which events you want to be notified about.',
        cardDescription: 'Choose which events you want to be notified about.',
        configureButton: 'Configure notifications',
        summary: 'You receive {{enabled}} of {{total}} notification types.',
        enableAll: 'Enable all',
        pauseAll: 'Pause all',
        saved: 'Saved',
        groupOnCount: '{{enabled}}/{{total}} on',
        groupToggle: 'Toggle all {{group}} notifications',
        Groups: {
          deployments: {
            label: 'Deployments & releases',
            description: 'Release lifecycle across your instances.',
          },
          instances: {
            label: 'Instances',
            description: 'Provisioning and lifecycle of customer instances.',
          },
          usage: {
            label: 'Usage & limits',
            description: 'Entitlement consumption against thresholds.',
          },
          integrations: {
            label: 'Integrations',
            description: 'Outbound webhooks and connector syncs.',
          },
          customers: {
            label: 'Customers',
            description: 'Customer records and onboarding outcomes.',
          },
          licensing: {
            label: 'Licensing',
            description: 'Licenses and the entitlements attached to them.',
          },
          billing: {
            label: 'Billing',
            description: 'Subscriptions and the invoices they issue.',
          },
          security: {
            label: 'Security',
            description: 'Credentials issued against your organization.',
          },
          other: {
            label: 'Other',
            description: 'Everything not covered by another group.',
          },
        },
        Events: {
          INSTANCE_CREATED: 'A new instance was created for a customer.',
          INSTANCE_DEPLOYED: 'An instance was placed in a deployment zone.',
          INSTANCE_DELETED: 'An instance was deleted or deprovisioned.',
          INSTANCE_MIGRATED: 'An instance moved to another deployment zone.',
          INSTANCE_LIFECYCLE_STAGE_CHANGED:
            'An instance moved to another commercial stage.',
          INSTANCE_STATUS_CHANGED:
            'An instance reported a new operational status.',
          INSTANCE_UPDATED:
            'An instance record was edited. Fires on every change.',
          CUSTOMER_CREATED: 'A new customer was added.',
          CUSTOMER_UPDATED: 'A customer record was edited.',
          CUSTOMER_DELETED: 'A customer was deleted.',
          CUSTOMER_CREATION_REJECTED: 'Creating a customer was refused.',
          RELEASE_CREATED: 'A new release became available in the catalog.',
          RELEASE_DEPLOYED: 'A release was rolled out to a deployment zone.',
          RELEASE_DELETED: 'A release was removed from the catalog.',
          DEPLOYMENT_ZONE_CREATED: 'A new deployment zone was created.',
          DEPLOYMENT_ZONE_DELETED: 'A deployment zone was deleted.',
          COMPONENT_CREATED: 'A component was added to the catalog.',
          COMPONENT_UPDATED:
            'A component was updated, including auto-versioning on release.',
          INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
            'Usage crossed an entitlement warning threshold.',
          INSTANCE_ENTITLEMENT_USAGE_REACHED:
            'Usage reached the full amount of an entitlement.',
          INSTANCE_ENTITLEMENT_CAP_EXCEEDED:
            'Usage reached or exceeded an entitlement cap.',
          ENTITLEMENT_USAGE_REPORT_REJECTED:
            'A usage report from an instance was refused; metering is stalled for it.',
          INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
            'A new usage period started for an entitlement.',
          LICENSE_CREATED: 'A new license was created.',
          LICENSE_UPDATED: 'A license was edited.',
          LICENSE_DELETED: 'A license was deleted.',
          LICENSE_ENTITLEMENT_ASSIGNED:
            'An entitlement was added to a license.',
          LICENSE_ENTITLEMENT_UNASSIGNED:
            'An entitlement was removed from a license.',
          INSTANCE_BILLING_STARTED:
            'An instance was subscribed, or a canceled subscription started again.',
          INSTANCE_BILLING_STATUS_CHANGED:
            'A trial converted, or a subscription became past due or left that status.',
          INSTANCE_BILLING_CANCELED:
            'A subscription was canceled, at the end of its period or immediately.',
          INSTANCE_INVOICE_HELD:
            'An invoice was held because its usage journal failed a check; it waits to be released or recomposed.',
          SYSTEM_ORGANIZATION_TOKEN_ISSUED:
            'A credential was issued for your organization.',
        },
      },
      App: {
        title: 'Application Settings',
        description:
          'Manage local application settings stored in your browser.',
        language: 'Language',
        languages: {
          en: 'English',
          fr: 'Français',
        },
        localStateTitle: 'Browser-stored settings',
        localStateDescription:
          'These settings stay local to your browser and are shared across tabs.',
        sideNavState: 'Side navigation is currently {{state}}.',
        sideNavExpanded: 'expanded',
        sideNavCollapsed: 'collapsed',
        resetButton: 'Reset local settings',
        ResetDialog: {
          title: 'Reset local application settings?',
          description:
            'This will restore the side navigation and future browser-stored settings to their default values on this device.',
          confirmButton: 'Reset settings',
        },
      },
      Billing: {
        title: 'Billing',
        subtitle:
          'Who collects your invoices, the defaults a subscription takes, and how long usage is kept.',
        cardDescription:
          'Who collects your invoices, the defaults a subscription takes, and how long usage is kept.',
        configureButton: 'Open billing settings',
        loading: 'Loading the billing settings',
        Providers: {
          title: 'Payment providers',
          description: 'Who collects the invoices of your organization.',
          available: 'Available',
          connected: 'Connected',
          notConnected: 'Not connected',
          Noop: {
            title: 'Manual hand-off',
            description:
              'Nothing to connect. Kaiten records each invoice and hands it to your own system, such as your ERP, through the handoff queue, and you collect it as you do today.',
            handoff: 'Open the handoff queue',
          },
          unavailable: 'Unavailable',
          Stripe: {
            description:
              'Collects the invoices of the subscriptions that use it.',
            connect: 'Connect Stripe',
            manage: 'Manage the connection',
            why: 'See why',
            Mode: {
              test: 'Test mode',
              live: 'Live mode',
            },
            Unavailable: {
              NOT_ENTITLED: 'Not included in your plan.',
              VAULT_NOT_CONFIGURED:
                'Needs a Vault to store the key in, and this deployment has none configured.',
              UNKNOWN: 'Not available on this deployment.',
            },
            Sync: {
              never: 'Not read yet: no pass of Stripe has run.',
              ok: 'Last synced {{ago}}.',
              partial:
                'Last synced {{ago}}, but some invoices could not be applied.',
              failing_one: 'The last sync failed {{ago}}.',
              failing_other:
                '{{count}} syncs in a row failed. The last was {{ago}}.',
              error: 'Last error: {{error}}',
              lastSuccess: 'Last successful sync {{ago}}.',
              noSuccess: 'No sync has succeeded yet.',
            },
          },
        },
        Health: {
          title: 'Health',
          description:
            'What needs attention in billing, and whether your payment provider is in step.',
          loading: 'Loading the health of billing',
          syncNow: 'Sync now',
          syncing: 'Syncing…',
          AllClear: {
            title: 'All clear',
            description:
              'Nothing is held, overdue or waiting, and no payment provider is out of step.',
          },
          Sync: {
            nothingNew:
              'Synced with the payment provider. Nothing had changed.',
            done_one:
              'Synced with the payment provider: {{count}} invoice updated.',
            done_other:
              'Synced with the payment provider: {{count}} invoices updated.',
            partial: 'Synced with the payment provider, with problems.',
            failed: 'The sync with the payment provider failed.',
          },
          Items: {
            held: {
              label: 'Held invoices',
              helper: 'Waiting for someone to release or recompose them.',
            },
            pushFailures: {
              label: 'Failed pushes',
              helper: 'The payment provider keeps refusing them.',
              oldest: 'The oldest failed {{ago}}.',
            },
            overdue: {
              label: 'Overdue invoices',
              helper: 'Unpaid past their due date.',
            },
            handoff: {
              label: 'Waiting for your accounting system',
              helper: 'Issued, and not booked yet.',
              oldest: 'The oldest was issued {{ago}}.',
            },
            mismatches: {
              label: 'Amounts that differ, last 30 days',
              helper: 'Kaiten and the payment provider disagree on the total.',
            },
            closeBacklog: {
              label: 'Periods not closed',
              helper: 'Periods that ended and have not closed yet.',
              oldest: 'The oldest was due {{ago}}.',
            },
            pastDue: {
              label: 'Subscriptions past due',
              helper: 'Their payment is late.',
            },
          },
        },
        Defaults: {
          title: 'Defaults for subscriptions',
          description:
            'A subscription that names no terms of its own takes these. They apply to the invoices issued from now on: an invoice already issued keeps the terms it was issued with.',
          save: 'Save the defaults',
          saved: 'Billing defaults saved',
          readOnly: 'Your session can read these defaults but not change them.',
          Labels: {
            collectionMethod: 'Collection method',
            daysUntilDue: 'Payment terms (days)',
            handoffStripeInvoices: 'Hand off Stripe invoices',
          },
          Descriptions: {
            collectionMethod:
              'How an invoice is collected when its subscription does not say. A subscription handed off manually sends its invoices whatever this is, since nothing can charge them.',
            daysUntilDue:
              'Days between issuing an invoice and its due date, from 0 to 365.',
            handoffStripeInvoices:
              'Also put the invoices a payment provider issues in the handoff queue, for an accounting system that wants every invoice.',
          },
          CollectionMethod: {
            SEND_INVOICE: 'Send the invoice',
            CHARGE_AUTOMATICALLY: 'Charge automatically',
            unavailable: '{{method}} (needs a payment provider)',
          },
          Errors: {
            daysUntilDue: 'Enter a whole number of days, from 0 to 365',
          },
        },
        Retention: {
          title: 'Usage retention',
          description:
            'How long the usage reports behind your invoices are kept.',
          months_one: 'Usage reports are kept for {{count}} month.',
          months_other: 'Usage reports are kept for {{count}} months.',
          unlimited:
            'No time limit is reported for usage reports on this deployment.',
          idempotency_one:
            'A report sent again with the same transaction id is ignored for {{count}} day.',
          idempotency_other:
            'A report sent again with the same transaction id is ignored for {{count}} days.',
        },
      },
      DataExport: {
        title: 'Export your data',
        description:
          'Deleting an organization erases what billing recorded for it, the journal of usage included, and Kaiten is not your accounting system. Export what you need to keep before you do.',
        Invoices: {
          title: 'Invoices',
          description: 'Every invoice of the organization, with its lines.',
        },
        Usage: {
          title: 'Usage reports',
          description_one:
            'The reports of every instance, one file for each month. Kaiten keeps {{count}} month of usage.',
          description_other:
            'The reports of every instance, one file for each month. Kaiten keeps {{count}} months of usage.',
          descriptionUnknown:
            'The reports of every instance, one file for each month. The last {{count}} months are listed; an older period is exported through the API.',
          list: 'Months of usage',
          export: 'Export CSV',
          exportMonth: 'Export the usage of {{month}} as a CSV',
        },
      },
      Metadata: {
        title: 'Metadata fields',
        subtitle:
          'Manage typed metadata fields for Deployment Zones and Instances.',
        cardDescription:
          'Configure typed metadata fields for Deployment Zones and Instances.',
        configureFieldsButton: 'Configure metadata fields',
        createButton: 'Create field',
        activeCount: 'active',
        archivedCount: 'archived',
        showArchived: 'Show archived',
        Restricted: {
          title: 'Restricted access',
          description:
            'Your current scopes do not allow reading metadata fields.',
          mutationToast:
            'Restricted access: metadata field changes are disabled until reload.',
          mutationBanner:
            'Restricted access was returned by the API. Mutating actions are disabled until the next reload or refetch.',
        },
        Error: {
          title: 'Unable to load fields',
          description: 'Metadata fields could not be loaded right now.',
          mutationFallback: 'Metadata field update failed.',
        },
        Empty: {
          title: 'No metadata fields yet',
          activeTitle: 'No active metadata fields',
          description:
            'Create a metadata field to start adding typed metadata to this resource.',
          createButton: 'Create your first field',
        },
        Dialog: {
          createTitle: 'Create metadata field',
          editTitle: 'Edit metadata field',
          duplicateTitle: 'Duplicate metadata field',
          description:
            'Define the typed metadata field exposed on this resource.',
          duplicateDescription:
            'A copy of the source field with a fresh key. Adjust the schema before saving if needed.',
          keyLabel: 'Key',
          labelLabel: 'Label',
          typeLabel: 'Primary type',
          optionsLabel: 'Options',
          optionsHint:
            'One option per line. Commas are kept as part of the value.',
          descriptionLabel: 'Description',
          descriptionPlaceholder:
            'Optional context for admins using this field.',
          descriptionHint: 'Plain text — Markdown is not rendered.',
          editRawSchema: 'Edit raw JSON Schema',
          useStructured: 'Use structured editor',
          rawSchemaLabel: 'Raw JSON Schema',
          rawSchemaDraftTooltip:
            'Authored as JSON Schema draft 2020-12 — the dialect that determines which keywords (type, enum, items, format, …) are valid.',
          rawSchemaHint:
            'Escape hatch — the server still applies transition rules and rejects unsafe changes.',
        },
        List: {
          reorderField: 'Reorder field',
          archivedBadge: 'Archived',
          archiveButton: 'Archive',
          duplicateButton: 'Duplicate',
          readOnly: 'Read-only',
          unarchiveButton: 'Unarchive',
        },
        Types: {
          unsupported: 'Unsupported',
        },
        Archive: {
          title: 'Archive metadata field?',
          description:
            'Archived fields stay readable for historic metadata but cannot be edited or reordered.',
          confirmButton: 'Archive',
          lastActiveWarning:
            'This is the last active field for this resource. Dynamic columns and filters built from the schema will disappear from the resource table.',
        },
        DryRun: {
          title: 'Existing values may become invalid',
          description:
            '{{count}} existing value(s) no longer match the new schema.',
          examplesTitle: 'Examples',
          confirmButton: 'Save anyway',
        },
        Toast: {
          created: 'Metadata field created.',
          updated: 'Metadata field updated.',
          archived: 'Metadata field archived.',
          unarchived: 'Metadata field unarchived.',
          reordered: 'Metadata fields reordered.',
        },
      },
      Demo: {
        title: 'Demo sandbox',
        description:
          'This organization is a self-service demo sandbox. Data may be reset at any time.',
        seedButton: 'Seed demo data',
        resetButton: 'Reset demo data',
        seedingProgress: 'Seeding demo data…',
        ResetDialog: {
          title: 'Reset demo data?',
          description:
            'This wipes all current organization data and reseeds the demo dataset.',
          confirmButton: 'Reset demo data',
        },
      },
    },
  },
  Features: {
    Billing: {
      Unavailable: {
        DEPLOYMENT_DISABLED: {
          title: 'Billing is not enabled',
          description:
            'Billing is switched off on this deployment. Set KAITEN_BILLING_ENABLED to true on the API to turn it on.',
        },
        NOT_ENTITLED: {
          title: 'Billing is not part of your plan',
          description:
            "Your organization's plan does not include billing. Upgrade your plan to use it.",
        },
        MISSING_SCOPE: {
          title: 'You do not have access to billing',
          description:
            'Billing cannot be opened with the access of this session.',
        },
        FEATURE_UNAVAILABLE: {
          title: 'Not available in this version',
          description:
            'This part of billing is not shipped by the version of Kaiten you are running.',
        },
        UNREACHABLE: {
          title: 'Billing could not be reached',
          description:
            'The billing capabilities did not load, so billing stays hidden. Nothing was changed. Try again in a moment.',
        },
      },
      MissingScope: {
        title: 'Missing access',
        description:
          'The token of your session does not carry the scope this needs:',
        unknownScope: 'a scope this action requires',
        templateHint:
          'If you should have it, the token template of your identity provider must list the billing scopes (read:billing and write:billing).',
      },
      Problems: {
        title: 'The request was refused',
        unreadableTitle: 'The data could not be read',
        generic: 'Something went wrong while talking to billing.',
        transient: 'Nothing was changed. You can try again.',
        providerUnreachable:
          'The payment provider could not be reached. Nothing was changed.',
        boundaryPending:
          'The period of this subscription has ended and is being closed. Nothing was changed. Try again in {{wait}}.',
        rateLimited:
          'Too many requests were sent in a short time. This is temporary: try again in {{wait}}.',
        retryIn: 'Try again in {{wait}}.',
        Wait: {
          seconds_one: 'a second',
          seconds_other: '{{count}} seconds',
          minutes_one: 'a minute',
          minutes_other: '{{count}} minutes',
        },
        BoundaryClosing: {
          title: 'Closing the period…',
          description:
            'The period of this subscription has ended and is being closed. Your request is sent again in a moment.',
        },
        reference: 'Reference {{id}}',
        outsideRetention: 'Usage before {{date}} is no longer kept.',
        providerCode: 'Code: {{code}}',
        providerParam: 'Field: {{param}}',
        providerRequest: 'Request: {{id}}',
        openConnector: 'Open the Stripe connector',
      },
      InvoiceStatus: {
        DRAFT: 'Draft',
        MANUAL: 'Ready to bill',
        PUSHED: 'Awaiting payment',
        PAID: 'Paid',
        PUSH_FAILED: 'Push failed',
        PAYMENT_FAILED: 'Payment failed',
        UNCOLLECTIBLE: 'Written off',
        VOID: 'Void',
        held: 'Held',
        overdue: 'Overdue',
      },
      HoldReason: {
        LEDGER_SEQUENCE_GAP: 'Usage reports are missing from the journal',
        LEDGER_CHAIN_BREAK: 'The usage journal chain is broken',
        LEDGER_COUNTER_MISMATCH: 'The usage counter does not match the journal',
        PROVIDER_ITEM_LIMIT: 'More lines than the payment provider accepts',
      },
      InvoiceLineType: {
        BASE: 'Base',
        ADDON: 'Add-on',
        USAGE: 'Usage',
        OVERAGE: 'Overage',
        DISCOUNT: 'Discount',
        unknown: 'Other',
      },
      SubscriptionStatus: {
        INCOMPLETE: 'Awaiting payment',
        TRIAL: 'Trial',
        ACTIVE: 'Active',
        PAST_DUE: 'Past due',
        CANCELED: 'Canceled',
        cancellationScheduled: 'Cancels at period end',
        none: 'Not subscribed',
      },
      CancellationReasons: {
        INCOMPLETE_EXPIRED:
          'The first payment was not made in time: the subscription never started and the instance kept its license.',
        TRIAL_ENDED_WITHOUT_PAYMENT_METHOD:
          'The trial ended with no payment method on file, so it did not become a paid subscription.',
      },
      LicensePriceSummary: {
        free: 'Free',
        custom: 'Custom pricing',
        unpriced: 'No price yet',
        usage: 'Usage-based',
        plusUsage: '+ usage',
      },
      SubscriptionActions: {
        Reasons: {
          trial: 'Unavailable during a trial',
          cancellationScheduled: 'Reactivate the subscription first',
        },
      },
      InvoiceKind: {
        ACTIVATION: 'Activation',
        RENEWAL: 'Renewal',
        FINAL: 'Final',
      },
      InvoiceLines: {
        capped: 'Capped',
        cappedExplanation:
          'The sample is above what the license accepts. Reports over the cap are rejected, so the excess is not billed.',
        empty: 'This invoice has no lines.',
        Columns: {
          line: 'Line',
          servicePeriod: 'Service period',
          amount: 'Amount',
        },
        Discount: {
          line: 'Line {{seq}}',
          percentageOf: '{{value}} of {{base}}',
          amountOff: '{{value}} off {{base}}',
          application: 'Invoice {{application}} of {{max}} for this redemption',
          applicationUnbounded: 'Invoice {{application}} for this redemption',
          bearsOn: 'Bears on {{targets}}',
        },
        Addon: {
          from: 'From the add-on {{name}}',
          fromRemoved: 'From the add-on {{name}}, removed on {{date}}',
          fromUnknown: 'From an add-on',
        },
      },
      InvoiceTotals: {
        subtotal: 'Subtotal',
        discounts: 'Discounts',
        total: 'Total',
        discounted: 'After {{amount}} of discounts',
      },
      InvoicePreview: {
        bannerTitle: 'Preview, not an invoice',
        bannerDescription:
          'This is what the invoice would come to at a boundary now. Nothing is saved, sent or billed.',
        resultLabel: 'Invoice preview',
        composed: '{{kind}} invoice, composed {{asOf}}.',
      },
      Fingerprint: {
        empty: 'No usage reports in this period.',
        summary_one: 'Report {{first}} · {{count}} row · Σ {{sum}}',
        summary_other:
          'Reports {{first}}–{{last}} · {{count}} rows · Σ {{sum}}',
      },
      HandoffStatus: {
        PENDING: 'Waiting for your ERP',
        ACKNOWLEDGED: 'Acknowledged',
        NOT_REQUIRED: 'Not required',
      },
      Invoices: {
        notIssued: 'Not issued',
        Columns: {
          customer: 'Customer',
          invoice: 'Invoice',
          period: 'Service period',
          total: 'Total',
          status: 'Status',
          due: 'Due',
          provider: 'Provider',
          handoff: 'Handoff',
        },
      },
      MarkPaid: {
        Errors: {
          referenceTooLong: 'The reference is too long',
          noteTooLong: 'The note is too long',
          paidAtInvalid: 'Enter a valid date and time',
          paidAtInFuture: 'The payment cannot be in the future',
        },
      },
      Overage: {
        unlimited: 'No limit',
        limit: 'Limit {{limit}} (+{{percent}}% accepted)',
        reports_one: '{{count}} report',
        reports_other: '{{count}} reports',
        measured: 'Usage {{usage}}, of which {{overage}} above the limit',
        limitsLabel: 'Limits applied',
      },
      ProviderKind: {
        NOOP: 'Manual',
        STRIPE: 'Stripe',
      },
      Price: {
        perUnit: 'per {{unit}}',
        Meter: {
          label: 'Metered entitlement',
          none: 'This version grants no entitlement a price can meter. Grant a counted or summed number that resets, then come back.',
          stock: 'A stock: it never resets, so it cannot be metered.',
          stockHint:
            'A stock, such as seats or storage, is sold as an add-on with a quantity, not metered.',
          stockHintLink: 'See the add-ons',
          stockHintAddon:
            'A stock, such as seats or storage, cannot be metered: bill it as a flat fee with a quantity.',
          overage: 'Bills above {{limit}} {{unit}}/{{period}}, up to {{cap}}',
          overageInstance:
            'Bills the usage above the limit the instance holds: its license and its add-ons together',
          overageUnknown:
            'Bills the usage above the allowance the version grants',
          overageUnreachable:
            'Overage cannot occur on this grant: its limit is hard or unlimited.',
          usageSum: 'Summed, resets every {{period}}',
          usageCount: 'Counted, resets every {{period}}',
        },
        Models: {
          FLAT_FEE: {
            label: 'Flat fee',
            blurb: 'Recurs each period, quantity 1.',
          },
          USAGE_BASED: {
            label: 'Usage-based',
            blurb: 'Meters from the first unit, per sale unit.',
          },
          OVERAGE: {
            label: 'Overage',
            blurb: 'Bills only what exceeds the grant, up to its cap.',
          },
        },
        Timings: {
          ADVANCE: {
            label: 'In advance',
            blurb: 'Bills the period that starts at the boundary.',
          },
          ARREARS: {
            label: 'In arrears',
            blurb: 'Bills the period that ends at the boundary.',
          },
        },
        Periods: {
          MONTHLY: 'Monthly',
          QUARTERLY: 'Quarterly',
          SEMI_ANNUAL: 'Every 6 months',
          ANNUAL: 'Annual',
        },
        PeriodSuffix: {
          MONTHLY: '/month',
          QUARTERLY: '/quarter',
          SEMI_ANNUAL: '/6 months',
          ANNUAL: '/year',
        },
        Status: {
          ACTIVE: 'Active',
          DEPRECATED: 'Deprecated',
        },
        ResetUnits: {
          HOUR: 'hour',
          DAY: 'day',
          WEEK: 'week',
          MONTH: 'month',
          YEAR: 'year',
        },
      },
      Reason: {
        description:
          'Required, up to {{max}} characters. It is kept with your name in the audit trail.',
        Errors: {
          required: 'A reason is required',
          tooLong: 'The reason is too long',
        },
      },
      UsageReports: {
        Columns: {
          report: 'Report',
          reportedAt: 'Reported at',
          behavior: 'Behavior',
          value: 'Value',
          counter: 'Counter',
          delta: 'Change',
          overageDelta: 'Overage change',
          limit: 'Limit',
          transaction: 'Transaction',
          properties: 'Properties',
        },
        Behavior: {
          append: 'Append',
          set: 'Set',
        },
        unlimited: 'No limit',
        limitChanged: 'Limit changed',
        propertiesTitle: 'Properties of report {{report}}',
        propertiesOpen: 'Show the properties of report {{report}}',
      },
      PeriodFilter: {
        from: 'From',
        before: 'Before',
        periodInvalid: 'The period must end after it starts.',
      },
      InvoiceExport: {
        button: 'Export',
        csvLines: 'CSV by invoice line',
        csvInvoices: 'CSV by invoice',
        ndjson: 'NDJSON, one invoice per line',
        unapplied_one: 'This filter is not applied to the file: {{filters}}.',
        unapplied_other:
          'These filters are not applied to the file: {{filters}}.',
      },
      InvoicesCard: {
        title: 'Invoices',
        loading: 'Loading invoices',
        emptyTitle: 'No invoices yet',
      },
      DeletionRefusal: {
        title: {
          instance: 'This instance cannot be deleted',
          customer: 'This customer cannot be deleted',
          entitlement: 'This entitlement cannot be deleted',
        },
        description: {
          instance:
            'Billing still depends on this instance, so it was kept. Nothing was deleted.',
          customer:
            'Billing still depends on this customer, so it was kept. Nothing was deleted.',
          entitlement:
            'Something still grants or prices this entitlement, so it was kept. Nothing was deleted.',
        },
        subscriptionTitle: 'Subscription',
        subscriptionLive: 'The subscription is still running.',
        subscriptionEnded:
          'The subscription has ended, but some of its invoices are not settled.',
        openSubscription: 'Open the subscription',
        customerLive:
          'A subscription of one of its instances is still running.',
        customerNoneLive:
          'None of its subscriptions is running, but some invoices are not settled.',
        openInstances: 'Open the customer',
        unsettledTitle_one: '{{count}} invoice not settled',
        unsettledTitle_other: '{{count}} invoices not settled',
        unsettledHint:
          'Settle each one (paid, void or written off), then try again.',
        referencesTitle: 'Still in use',
        references: {
          licenseGrants_one: 'Granted by {{count}} license version',
          licenseGrants_other: 'Granted by {{count}} license versions',
          licensePrices_one: 'Metered by {{count}} license price',
          licensePrices_other: 'Metered by {{count}} license prices',
          addonPrices_one: 'Metered by {{count}} add-on price',
          addonPrices_other: 'Metered by {{count}} add-on prices',
          addonGrants_one: 'Granted by {{count}} add-on',
          addonGrants_other: 'Granted by {{count}} add-ons',
          boostGrants_one: 'Granted by {{count}} voucher boost',
          boostGrants_other: 'Granted by {{count}} voucher boosts',
        },
        removeFirst:
          'Remove these references, then delete the entitlement again.',
        hideInstead:
          'A price or a voucher boost cannot be removed once it exists, so this entitlement can no longer be deleted. To stop showing it in customer-facing components, turn off “User facing” on its page.',
        openEntitlement: 'Open the entitlement',
      },
      VoucherStatus: {
        DRAFT: 'Draft',
        ACTIVE: 'Active',
        EXPIRED: 'Expired',
        EXHAUSTED: 'Fully redeemed',
        ARCHIVED: 'Archived',
      },
      VoucherType: {
        PRICE: 'Discount',
        ENTITLEMENT_BOOST: 'Boost',
      },
      RedemptionStatus: {
        ACTIVE: 'Active',
        EXPIRED: 'Expired',
        REVOKED: 'Revoked',
      },
      Redemptions: {
        title: 'Redemptions',
        loading: 'Loading redemptions',
        emptyTitle: 'No redemption yet',
        codeHint: 'Code ending in {{hint}}',
        from: 'From {{date}}',
        applications: '{{count}}/{{max}} invoices',
        applicationsUnbounded_one: '{{count}} invoice so far',
        applicationsUnbounded_other: '{{count}} invoices so far',
        revokedBecause: 'Revoked: {{reason}}',
        revoke: 'Revoke {{name}}',
        Columns: {
          instance: 'Instance',
          voucher: 'Voucher',
          redeemed: 'Redeemed',
          window: 'Applies',
          applications: 'Invoices',
          status: 'Status',
        },
        Revoke: {
          title: 'Revoke {{name}} on {{instance}}',
          description:
            'A boost stops applying at once and a discount applies to no further invoice. Invoices already issued are not changed, and the voucher keeps counting this redemption.',
          reason: 'Reason',
          confirm: 'Revoke',
          success: '{{name}} revoked',
        },
      },
      Voucher: {
        Offer: {
          price: '{{discount}} off {{target}}, {{duration}}',
          boost: '{{changes}}, {{duration}}',
          Target: {
            LICENSE_BASE: 'the base price',
            ADDONS: 'the add-ons',
            BOTH: 'the base price and the add-ons',
            SELECTED_PRICES_one: 'the selected price',
            SELECTED_PRICES_other: 'the {{count}} selected prices',
          },
          PriceDuration: {
            ONE_TIME: 'on one invoice',
            REPEATING_one: 'on the next invoice',
            REPEATING_other: 'on the next {{count}} invoices',
            FOREVER: 'on every invoice',
          },
          BoostDuration: {
            ONE_TIME: 'for one billing period',
            REPEATING_one: 'for {{count}} billing period',
            REPEATING_other: 'for {{count}} billing periods',
            FOREVER: 'with no end',
          },
          Change: {
            SET: '{{entitlement}} set to {{value}}',
            ADD: '{{entitlement}} + {{value}}',
            MULTIPLY: '{{entitlement}} × {{value}}',
            UNLIMITED: '{{entitlement}} unlimited',
          },
        },
      },
    },
    AuditTrail: {
      events: {
        ADDON_ARCHIVED: 'Add-on version archived',
        ADDON_CREATED: 'Add-on created',
        ADDON_DELETED: 'Add-on deleted',
        ADDON_ENTITLEMENT_ASSIGNED: 'Entitlement assigned to an add-on',
        ADDON_ENTITLEMENT_UNASSIGNED: 'Entitlement unassigned from an add-on',
        ADDON_ENTITLEMENT_UPDATED: 'Entitlement updated on an add-on',
        ADDON_PRICE_CREATED: 'Add-on price added',
        ADDON_PRICE_DEPRECATED: 'Add-on price deprecated',
        ADDON_PUBLISHED: 'Add-on version published',
        ADDON_UNARCHIVED: 'Add-on version unarchived',
        ADDON_UPDATED: 'Add-on updated',
        BILLING_PROVIDER_CONNECTED: 'Payment provider connected',
        BILLING_PROVIDER_DISCONNECTED: 'Payment provider disconnected',
        BILLING_PROVIDER_SYNC_FAILED: 'Payment provider sync failed',
        CHECKOUT_SESSION_ABANDONED: 'Checkout abandoned',
        CHECKOUT_SESSION_COMPLETED: 'Checkout completed',
        CHECKOUT_SESSION_STARTED: 'Checkout started',
        COMPONENT_CREATED: 'Component added',
        COMPONENT_DELETED: 'Component deleted',
        COMPONENT_UPDATED: 'Component updated',
        CUSTOMER_CREATED: 'Customer created',
        CUSTOMER_CREATION_REJECTED: 'Customer creation rejected',
        CUSTOMER_DELETED: 'Customer deleted',
        CUSTOMER_PAYMENT_METHOD_ATTACHED: 'Payment method added',
        CUSTOMER_PAYMENT_METHOD_DETACHED: 'Payment method removed',
        CUSTOMER_PAYMENT_METHOD_EXPIRING: 'Payment method about to expire',
        CUSTOMER_UPDATED: 'Customer updated',
        DEPLOYMENT_ZONE_CREATED: 'Deployment zone created',
        DEPLOYMENT_ZONE_DELETED: 'Deployment zone deleted',
        DEPLOYMENT_ZONE_UPDATED: 'Deployment zone updated',
        ENTITLEMENT_CREATED: 'Entitlement created',
        ENTITLEMENT_DELETED: 'Entitlement deleted',
        ENTITLEMENT_GROUP_CREATED: 'Entitlement group created',
        ENTITLEMENT_GROUP_DELETED: 'Entitlement group deleted',
        ENTITLEMENT_GROUP_UPDATED: 'Entitlement group updated',
        ENTITLEMENT_UPDATED: 'Entitlement updated',
        ENTITLEMENT_USAGE_REPORT_ACCEPTED: 'Usage reported',
        ENTITLEMENT_USAGE_REPORT_REJECTED: 'Usage rejected',
        ENTITLEMENT_VALUE_GET: 'Entitlement read',
        FEATURE_FLAG_CREATED: 'Feature flag created',
        FEATURE_FLAG_DELETED: 'Feature flag deleted',
        FEATURE_FLAG_EVALUATED: 'Feature flag evaluated',
        FEATURE_FLAG_UPDATED: 'Feature flag updated',
        INSTANCE_ADDON_ADDED: 'Add-on attached to an instance',
        INSTANCE_ADDON_QUANTITY_CHANGED: 'Add-on quantity changed',
        INSTANCE_ADDON_REMOVED: 'Add-on removed from an instance',
        INSTANCE_BILLING_CANCELED: 'Subscription canceled',
        INSTANCE_BILLING_CANCELLATION_REVERTED:
          'Subscription cancellation reverted',
        INSTANCE_BILLING_CANCELLATION_SCHEDULED:
          'Subscription cancellation scheduled',
        INSTANCE_BILLING_PLAN_CHANGED: 'Subscription plan changed',
        INSTANCE_BILLING_PLAN_CHANGE_CANCELED: 'Plan change canceled',
        INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED: 'Plan change scheduled',
        INSTANCE_BILLING_PROVIDER_CHANGED:
          'Subscription payment provider changed',
        INSTANCE_BILLING_STARTED: 'Subscription started',
        INSTANCE_BILLING_TRIAL_WILL_END: 'Trial ending soon',
        INSTANCE_BILLING_STATUS_CHANGED: 'Subscription status changed',
        INSTANCE_CREATED: 'Instance created',
        INSTANCE_DELETED: 'Instance deleted',
        INSTANCE_DEPLOYED: 'Instance deployed',
        INSTANCE_ENTITLEMENT_CAP_EXCEEDED: 'Entitlement limit exceeded',
        INSTANCE_ENTITLEMENT_EXCEPTION_CREATED: 'Entitlement exception created',
        INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED: 'Entitlement exception expired',
        INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED: 'Entitlement exception revoked',
        INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
          'Usage period rolled over',
        INSTANCE_ENTITLEMENT_USAGE_REACHED: 'Entitlement fully used',
        INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
          'Entitlement near limit',
        INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED: 'Invoice handoff acknowledged',
        INSTANCE_INVOICE_HELD: 'Invoice held',
        INSTANCE_INVOICE_ISSUED: 'Invoice issued',
        INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE: 'Invoice marked uncollectible',
        INSTANCE_INVOICE_PAID: 'Invoice paid',
        INSTANCE_INVOICE_PAYMENT_FAILED: 'Invoice payment failed',
        INSTANCE_INVOICE_PUSHED: 'Invoice sent to the payment provider',
        INSTANCE_INVOICE_PUSH_FAILED:
          'Invoice not sent to the payment provider',
        INSTANCE_INVOICE_RECONCILIATION_MISMATCH:
          'Invoice amounts differ at the payment provider',
        INSTANCE_INVOICE_RELEASED: 'Held invoice released',
        INSTANCE_INVOICE_VOIDED: 'Invoice voided',
        INSTANCE_LIFECYCLE_STAGE_CHANGED: 'Instance lifecycle stage changed',
        INSTANCE_MIGRATED: 'Instance migrated',
        INSTANCE_STATUS_CHANGED: 'Instance status changed',
        INSTANCE_UPDATED: 'Instance updated',
        INSTANCE_VOUCHER_EXPIRED: 'Voucher redemption expired',
        INSTANCE_VOUCHER_REDEEMED: 'Voucher redeemed',
        INSTANCE_VOUCHER_REVOKED: 'Voucher redemption revoked',
        LICENSE_ARCHIVED: 'License version archived',
        LICENSE_CREATED: 'License created',
        LICENSE_DELETED: 'License deleted',
        LICENSE_ENTITLEMENT_ASSIGNED: 'Entitlement assigned to a license',
        LICENSE_ENTITLEMENT_UNASSIGNED: 'Entitlement unassigned from a license',
        LICENSE_ENTITLEMENT_UPDATED: 'Entitlement updated on a license',
        LICENSE_FAMILY_CREATED: 'License family created',
        LICENSE_FAMILY_DELETED: 'License family deleted',
        LICENSE_FAMILY_UPDATED: 'License family updated',
        LICENSE_PRICE_CREATED: 'License price added',
        LICENSE_PRICE_DEPRECATED: 'License price deprecated',
        LICENSE_PRICE_UPDATED: 'License price updated',
        LICENSE_PUBLISHED: 'License version published',
        LICENSE_UNARCHIVED: 'License version unarchived',
        LICENSE_UPDATED: 'License updated',
        METADATA_FIELD_ARCHIVED: 'Metadata field archived',
        METADATA_FIELD_CREATED: 'Metadata field created',
        METADATA_FIELD_REORDERED: 'Metadata fields reordered',
        METADATA_FIELD_UNARCHIVED: 'Metadata field unarchived',
        METADATA_FIELD_UPDATED: 'Metadata field updated',
        PUBLISHABLE_KEY_CREATED: 'Publishable key created',
        PUBLISHABLE_KEY_REVOKED: 'Publishable key revoked',
        RELEASE_CREATED: 'Release published',
        RELEASE_DELETED: 'Release deleted',
        RELEASE_DEPLOYED: 'Release deployed to a zone',
        SYSTEM_ORGANIZATION_TOKEN_ISSUED: 'Organization token issued',
        VOUCHER_ARCHIVED: 'Voucher archived',
        VOUCHER_CREATED: 'Voucher created',
        VOUCHER_EXHAUSTED: 'Voucher fully redeemed',
        VOUCHER_EXPIRED: 'Voucher expired',
        VOUCHER_PUBLISHED: 'Voucher published',
        VOUCHER_UPDATED: 'Voucher updated',
      },
    },
    EntitlementUsage: {
      status: {
        healthy: 'Healthy',
        watch: 'Watch',
        nearLimit: 'Near limit',
        inAllowance: 'In allowance',
        atLimit: 'Limit reached',
        overLimit: 'Over limit',
        unlimited: 'Unlimited',
      },
    },
    Targeting: {
      rule: 'Rule',
      variant: 'Variant',
      Types: {
        basic: 'Basic Targeting',
        rolloutDate: 'Rollout Date',
        rolloutPercentage: 'Rollout Percentage',
      },
      List: {
        title: 'Targeting Rules',
        description:
          'Define conditions for feature flag evaluation. Order matters!',
        addButton: 'Add Rule',
        addFirstButton: 'Add First Rule',
        emptyState:
          'No targeting rules yet. Click the button above to add your first rule.',
        noVariantsWarning:
          'Please define variants in Step 2 before adding targeting rules.',
        deleteConfirmTitle: 'Delete Targeting Rule?',
        deleteConfirmDescription:
          'This action cannot be undone. The targeting rule will be permanently deleted.',
      },
      Dialog: {
        titleCreate: 'Create Targeting Rule',
        titleEdit: 'Edit Targeting Rule',
        description: 'Configure targeting conditions using CEL expressions',
        selectType: 'Targeting Type',
        basicDescription:
          'Simple rule that returns a single variant when the CEL expression is true',
        rolloutDateDescription:
          'Progressive rollout over time with start and end dates',
        rolloutPercentageDescription:
          'A/B testing with percentage distribution between variants',
      },
      BasicForm: {
        name: 'Name',
        namePlaceholder: 'Enterprise Customers',
        rule: 'CEL Expression',
        rulePlaceholder:
          "__kaiten.license.familySlug == 'scale' && __kaiten.deploymentZone.type == 'production'",
        ruleDescription:
          "CEL expression to evaluate (e.g. __kaiten.deploymentZone.type == 'production')",
        variant: 'Variant',
        variantPlaceholder: 'Select variant',
      },
      RolloutDateForm: {
        name: 'Name',
        namePlaceholder: 'EU Gradual Rollout',
        rule: 'CEL Expression',
        rulePlaceholder: "__kaiten.deploymentZone.type == 'production'",
        ruleDescription:
          "CEL expression to evaluate (e.g. __kaiten.deploymentZone.type == 'production')",
        startConfiguration: 'Start Configuration',
        endConfiguration: 'End Configuration',
        startDate: 'Start Date',
        startPercentage: 'Start Percentage',
        startVariant: 'Start Variant',
        endDate: 'End Date',
        endPercentage: 'End Percentage',
        endVariant: 'End Variant',
        variantPlaceholder: 'Select variant',
      },
      RolloutPercentageForm: {
        name: 'Name',
        namePlaceholder: 'Premium A/B Test',
        rule: 'CEL Expression',
        rulePlaceholder: "__kaiten.license.familySlug == 'scale'",
        ruleDescription: 'CEL expression to determine eligible users',
        distribution: 'Percentage Distribution',
        addVariant: 'Add Variant',
        noVariants:
          'No variants in distribution. Click "Add Variant" to start.',
        total: 'Total',
        distributionError: 'The total percentage must equal 100%',
        equalDistribution: 'Distribute equally among all variants',
      },
      Errors: {
        distributionSum: 'Distribution percentages must sum to 100',
        nameRequired: 'Name is required',
        ruleRequired: 'CEL rule is required',
        invalidCel: 'Invalid CEL expression',
        variantRequired: 'Variant is required',
        startDateRequired: 'Start date is required',
        startVariantRequired: 'Start variant is required',
        endDateRequired: 'End date is required',
        endVariantRequired: 'End variant is required',
        percentageRequired: 'Percentage is required',
        percentageInvalid: 'Must be a valid number',
        percentageMin: 'Percentage must be at least 0',
        percentageMax: 'Percentage must be at most 100',
      },
      Editor: {
        test: 'Test',
        testDisabledHint: 'Write a rule to test it',
        testTitle: 'Test this rule',
        testDescription:
          'Runs the rule exactly the way an evaluation would, against the context below. Nothing is saved.',
        testInstance: 'Instance',
        testInstancePlaceholder: 'Select an instance (optional)',
        testInstanceNone: 'No instance',
        testTargetingKey: 'Targeting key',
        testTargetingKeyPlaceholder: 'customer slug, user id…',
        testContext: 'Additional context (JSON)',
        testContextPlaceholder: '{ "user": { "cohort": "beta" } }',
        testContextInvalid: 'This is not valid JSON',
        testRun: 'Run the rule',
        testMatched: 'Matched',
        testNotMatched: 'Did not match',
        testInvalidRule: 'The rule has errors and was not run',
        testEvaluationError:
          'The rule could not be evaluated — at a real evaluation it would simply not match',
        testFacts: 'What the server saw (__kaiten)',
      },
    },
    Variants: {
      List: {
        title: 'Variants',
        description: 'Define the possible values for this feature flag',
        addButton: 'Add Variant',
        addFirstButton: 'Add First Variant',
        emptyState:
          'No variants yet. Click the button above to add your first variant.',
        duplicateWarning:
          'Duplicate variant names detected! Each variant must have a unique name.',
        lockedVariantTooltip: 'This system variant cannot be deleted.',
        deleteConfirmTitle: 'Delete Variant?',
        deleteConfirmDescription:
          'This action cannot be undone. The variant will be permanently deleted.',
      },
      Form: {
        name: 'Name',
        namePlaceholder: 'variant_name',
        description: 'Description',
        descriptionPlaceholder: 'A short description of this variant',
        value: 'Value',
        valuePlaceholder: 'Enter value',
        valueDescription: {
          string: 'String value',
          number: 'Numeric value',
          object: 'JSON object',
        },
        Errors: {
          nameRequired: 'Variant name is required',
          valueRequired: 'Value is required',
          valueInvalidNumber: 'Value must be a valid number',
          valueInvalidJSON: 'Value must be valid JSON',
        },
      },
    },
    Releases: {
      Table: {
        Columns: {
          name: 'Name',
          version: 'Version',
          type: 'Type',
          description: 'Description',
          features: 'Features',
          deploymentZones: 'Deployment Zones',
          currentRelease: 'Current Release',
          createdAt: 'Created',
          updatedAt: 'Updated',
          status: 'Status',
          components: 'Components',
          instances: 'Instances',
          component: 'Component',
          releases: 'Releases',
          release: 'Release',
          deploymentZone: 'Deployment Zone',
          zoneType: 'Zone Type',
          deployedAt: 'Deployed At',
          deployedBy: 'Deployed By',
          metadata: 'Metadata',
          extraMetadata: 'Extra metadata',
        },
        notDeployed: 'Not deployed',
      },
      Stats: {
        totalReleases: 'Total Releases',
        deployed: 'Deployed',
        inStaging: 'In Staging',
        superseded: 'Superseded',
        planned: 'Planned',
        totalComponents: 'Total Components',
        active: 'Active',
        deprecated: 'Deprecated',
        totalZones: 'Total Zones',
        productionZones: 'Production Zones',
        totalInstances: 'Total Instances',
        totalDeployments: 'Total Deployments',
        production: 'Production',
        staging: 'Staging',
        development: 'Development',
      },
      Form: {
        name: 'Name',
        version: 'Version',
        type: 'Type',
        description: 'Description',
        descriptionPlaceholder: 'Describe this release...',
        zoneDescriptionPlaceholder: 'Describe this deployment zone...',
        slug: 'Slug',
        slugDescription: 'Auto-generated — edit to set a custom one.',
        zoneSlugPlaceholder: 'production-eu',
        releaseSlugPlaceholder: 'v1-0-0',
        features: 'Features (JSON)',
        featuresHelp: 'Metadata as JSON object',
        invalidJson: 'Invalid JSON format',
        selectType: 'Select or type a type',
        searchType: 'Search or create a type',
        typeDescription:
          'Any type other than staging or development counts as production.',
        selectRelease: 'Select a release',
        selectReleasePlaceholder: 'Choose a release...',
        deployRelease: 'Deploy Release',
        createRelease: 'Create Release',
        editRelease: 'Edit Release',
        SubmitBlockers: {
          title: 'You still need to fix the following before submitting:',
          stepTitle: 'Complete this step before continuing:',
          submissionInProgress: 'Submission is already in progress.',
          validationInProgress: 'Validation is still running.',
          noChanges: 'Fill in the form before creating the release.',
          creationModeRequired: 'Choose how to create the release.',
          previousReleaseRequired: 'Select a base release.',
          versionRequired: 'Version is required.',
          reviewForm: 'Review the highlighted fields before submitting.',
        },
        createZone: 'Create Deployment Zone',
        editZone: 'Edit Deployment Zone',
        deployToZone: 'Deploy a release to {{zone}}',
        deployVersion: 'Deploy {{version}}',
        deployVersionDescription: 'Pick the deployment zone it should run in.',
        selectZone: 'Deployment zone',
        selectZonePlaceholder: 'Choose a deployment zone...',
        zoneAlreadyRuns: 'This zone already runs {{version}}.',
        noMetadataFieldsTitle: 'No metadata field declared',
        noMetadataFieldsDescription:
          'Declare deployment zone metadata fields in the settings to fill them here, or edit the raw JSON.',
        configureMetadataFields: 'Configure metadata fields',
        editAsJson: 'Edit as JSON',
        metadata: 'Metadata',
        metadataHelp: 'Metadata as JSON object',
        extraMetadataTitle: 'Extra metadata stored on this zone',
        extraMetadataHint:
          'These keys aren’t covered by an active schema. Archived keys are preserved on save; truly unknown keys will be dropped to satisfy the strict schema.',
      },
      Types: {
        production: 'Production',
        staging: 'Staging',
        development: 'Development',
      },
      Status: {
        deployed: 'Deployed',
        staging: 'Staging',
        superseded: 'Superseded',
        planned: 'Planned',
      },
      Actions: {
        deploy: 'Deploy',
        edit: 'Edit',
        delete: 'Delete',
      },
      Success: {
        releaseCreated: 'Release created successfully',
        releaseUpdated: 'Release updated successfully',
        releaseDeleted: 'Release deleted successfully',
        releaseDeployed: 'Release deployed successfully',
        zoneCreated: 'Deployment zone created successfully',
        zoneUpdated: 'Deployment zone updated successfully',
        zoneDeleted: 'Deployment zone deleted successfully',
      },
      deleteError: 'Failed to delete release',
      deleteZoneError: 'Failed to delete deployment zone',
      Metadata: {
        title: 'Metadata Configuration',
        description:
          'JSON metadata configuration for this deployment zone. Click to view full details.',
      },
      ExtraMetadata: {
        title: 'Extra metadata',
        description:
          'Values stored on this zone that are not covered by an active metadata field schema.',
      },
      Dialogs: {
        releaseHistoryTitle: 'Release history',
      },
    },
    DemoSandbox: {
      Banner: {
        warning:
          'This is a demo/sandbox environment — data may be reset at any time.',
        seedButton: 'Seed demo data',
        seedingProgress: 'Seeding demo data…',
        manageLink: 'Manage demo data in Settings',
      },
      Toasts: {
        seedStarted: 'Demo data seeding started.',
        resetStarted: 'Demo data reset started.',
        alreadyRunning: 'A demo data seed or reset is already running.',
      },
    },
  },
} as const;
