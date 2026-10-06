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
    cancel: 'Cancel',
    confirm: 'Confirm',
    undo: 'Undo',
    continue: 'Continue',
    search: 'Search',
    close: 'Close',
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
      templateEntitlementNearLimit: 'Entitlement near its limit',
      templateEntitlementExhausted: 'Entitlement exhausted',
      templateHostAttribute: 'One of your own attributes',
      editRule: 'Edit the rule',
      writeRule: 'Write the rule…',
      dialogTitle: 'CEL rule',
      dialogDescription:
        'Completion and documentation follow your context; problems are checked as you type. Nothing is saved until you apply.',
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
        hosts: 'Hosts',
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
            createdAt: 'Created at',
            updatedAt: 'Updated at',
          },
          by: 'by',
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
          },
          Placeholders: {
            name: 'Acme Inc.',
            customId: 'HubSpot ID',
            domain: 'acme.com',
            slug: 'acme-inc',
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
          },
          Errors: {
            name: 'Name is required',
            domain: 'Domain must be a valid domain name (e.g. acme.com)',
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
          tabs: {
            overview: 'Overview',
            entitlements: 'Entitlements & Usage',
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
              },
            },
            status: {
              enabled: 'Enabled',
              disabled: 'Disabled',
              unknown: 'Unknown',
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
    Licenses: {
      title: 'Licenses',
      subtitle: 'Manage licenses and entitlement limits',
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
        confirm: 'Delete',
        success: 'Draft deleted',
      },
      VersionsTable: {
        Columns: {
          versionName: 'Version name',
          version: 'Version',
          type: 'Type',
          lifecycleState: 'State',
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
              'How often the usage counter goes back to zero. A lifetime counter never resets, and the cadence can be set once but never changed.',
            resetPeriodLocked:
              'The reset cadence is fixed once set: stored usage would become impossible to interpret if it changed.',
            resetAnchor:
              "Calendar windows start on UTC calendar boundaries. License start windows are phased off each instance's own license start date.",
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
          },
          Steps: {
            identity: 'Entitlement information',
            type: 'Type configuration',
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
      Connectors: {
        title: 'Connectors',
        pageDescription:
          'Sync Kaiten data with your CRM and billing tools. Each connector runs independently and can be configured per organization.',
        Status: {
          connected: 'Connected',
          available: 'Available',
          comingH1: 'Coming H1',
          comingH2: 'Coming H2',
        },
        Sections: {
          connected: 'Connected ({{count}})',
          crm: 'CRM',
          billing: 'Billing',
          noConnectors: 'No active connectors.',
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
          entitlement: 'Entitlements',
          entitlementGroup: 'Entitlement groups',
          usage: 'Usage',
          subscription: 'Subscriptions',
          invoice: 'Invoices',
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
        searchPlaceholder: 'Search by event, instance or customer…',
        empty: 'No audit trail entries found',
        actions: {
          viewDetails: 'View details',
        },
        headers: {
          event: 'Event',
          instance: 'Instance',
          customer: 'Customer',
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
          RELEASE_CREATED: 'A new release became available in the catalogue.',
          RELEASE_DEPLOYED: 'A release was rolled out to a deployment zone.',
          RELEASE_DELETED: 'A release was removed from the catalogue.',
          DEPLOYMENT_ZONE_CREATED: 'A new deployment zone was created.',
          DEPLOYMENT_ZONE_DELETED: 'A deployment zone was deleted.',
          COMPONENT_CREATED: 'A component was added to the catalogue.',
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
    AuditTrail: {
      events: {
        COMPONENT_CREATED: 'Component added',
        COMPONENT_DELETED: 'Component deleted',
        COMPONENT_UPDATED: 'Component updated',
        CUSTOMER_CREATED: 'Customer created',
        CUSTOMER_CREATION_REJECTED: 'Customer creation rejected',
        CUSTOMER_DELETED: 'Customer deleted',
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
        INSTANCE_BILLING_CANCELED: 'Subscription canceled',
        INSTANCE_BILLING_CANCELLATION_REVERTED:
          'Subscription cancellation reverted',
        INSTANCE_BILLING_CANCELLATION_SCHEDULED:
          'Subscription cancellation scheduled',
        INSTANCE_BILLING_PLAN_CHANGED: 'Subscription plan changed',
        INSTANCE_BILLING_PLAN_CHANGE_CANCELLED: 'Plan change canceled',
        INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED: 'Plan change scheduled',
        INSTANCE_BILLING_STARTED: 'Subscription started',
        INSTANCE_BILLING_STATUS_CHANGED: 'Subscription status changed',
        INSTANCE_CREATED: 'Instance created',
        INSTANCE_DELETED: 'Instance deleted',
        INSTANCE_DEPLOYED: 'Instance deployed',
        INSTANCE_ENTITLEMENT_CAP_EXCEEDED: 'Entitlement limit exceeded',
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
        INSTANCE_INVOICE_RELEASED: 'Held invoice released',
        INSTANCE_INVOICE_VOIDED: 'Invoice voided',
        INSTANCE_LIFECYCLE_STAGE_CHANGED: 'Instance lifecycle stage changed',
        INSTANCE_MIGRATED: 'Instance migrated',
        INSTANCE_STATUS_CHANGED: 'Instance status changed',
        INSTANCE_UPDATED: 'Instance updated',
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
        RELEASE_CREATED: 'Release published',
        RELEASE_DELETED: 'Release deleted',
        RELEASE_DEPLOYED: 'Release deployed to a zone',
        SYSTEM_ORGANIZATION_TOKEN_ISSUED: 'Organization token issued',
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
