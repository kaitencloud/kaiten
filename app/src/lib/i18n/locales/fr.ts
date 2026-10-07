export default {
  Common: {
    stepOf: 'Etape {{current}} sur {{total}}',
    requiredFieldsHint: 'Renseignez les champs obligatoires',
    edit: 'Modifier',
    delete: 'Supprimer',
    actions: 'Actions',
    moveUp: 'Déplacer vers le haut',
    moveDown: 'Déplacer vers le bas',
    reorder: 'Réordonner',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    undo: 'Annuler',
    continue: 'Continuer',
    search: 'Rechercher',
    close: 'Fermer',
    toggleSection: 'Afficher ou masquer la section',
    save: 'Enregistrer',
    apply: 'Appliquer',
    format: 'Formater',
    create: 'Créer',
    new: 'Nouveau',
    update: 'Mettre à jour',
    loading: 'chargement...',
    noResults: 'Aucun résultat',
    none: 'Aucun',
    useValue: 'Utiliser « {{value}} »',
    retry: 'Réessayer',
    reset: 'Réinitialiser',
    table: 'Table',
    list: 'Liste',
    filter: 'Filtrer',
    filterBy: 'Filtrer par :',
    addFilter: 'Ajouter un filtre',
    clearFilter: 'Effacer le filtre',
    removeFilterForField: 'Retirer le filtre {{field}}',
    advancedFilter: 'Filtre avancé',
    where: 'Où',
    addRule: 'Ajouter une règle',
    deleteRule: 'Supprimer la règle',
    clearRules: 'Effacer les règles',
    and: 'et',
    pickDate: 'Choisir une date',
    all: 'Tous',
    trueValue: 'Vrai',
    falseValue: 'Faux',
    filterFieldPlaceholder: 'Filtrer {{field}}...',
    selectedCount: '{{count}} sélectionnés',
    rulesCount_one: '{{count}} règle',
    rulesCount_other: '{{count}} règles',
    noFilterAvailable: 'Aucun filtre disponible',
    or: 'ou',
    confirmDeleteTitle: 'Êtes-vous sûr ?',
    confirmDeleteDescription:
      'Cette action ne peut pas être annulée. Cela supprimera {{name}}',
    discardFormChangesTitle: 'Abandonner les modifications ?',
    discardFormChangesDescription:
      'Si vous fermez maintenant, les informations non enregistrées seront perdues.',
    discardFormChangesConfirm: 'Abandonner',
    deleteSuccess: 'Élément supprimé avec succès',
    deleteError: "Échec de la suppression de l'élément",
    moreInformation: "Plus d'informations",
    charts: {
      emptyState: 'Aucune donnée disponible',
    },
    tableSortAriaAsc: 'Tri croissant : {{column}}',
    tableSortAriaDesc: 'Tri décroissant : {{column}}',
    tableSortAriaNone: 'Non trié, cliquer pour trier : {{column}}',
    tableShowingRecords:
      'Affichage des enregistrements {{start}}-{{end}} sur {{total}}',
    rowsPerPage: 'Lignes par page',
    firstPage: 'Première page',
    previous: 'Précédent',
    next: 'Suivant',
    lastPage: 'Dernière page',
  },
  Functionals: {
    CelEditor: {
      checking: 'Vérification…',
      noIssues: 'Aucun problème',
      issueCount_one: '{{count}} problème',
      issueCount_other: '{{count}} problèmes',
      issueLine: 'Ligne {{line}}',
      context: 'Contexte',
      contextTitle: "Ce qu'une règle peut lire",
      contextOpenWorld:
        "Liste non fermée : les attributs de vos propres contextes d'évaluation sont aussi ciblables.",
      contextMayBeAbsent: 'peut être absent',
      contextCurrentKeys: 'Clés actuelles :',
      templates: 'Modèles',
      templateProductionZone: 'Zone de production',
      templateHealthyInstance: 'Instance saine',
      templateEntitlementNearLimit: 'Entitlement proche de sa limite',
      templateEntitlementExhausted: 'Entitlement épuisé',
      templateHostAttribute: 'Un de vos propres attributs',
      editRule: 'Modifier la règle',
      writeRule: 'Écrire la règle…',
      dialogTitle: 'Règle CEL',
      dialogDescription:
        "La complétion et la documentation suivent votre contexte ; les problèmes sont vérifiés pendant la frappe. Rien n'est enregistré avant d'appliquer.",
    },
  },
  Errors: {
    title: 'Une erreur est survenue',
    description: 'Une erreur est survenue lors du chargement de cette page.',
    errorTitle: 'Erreur',
    unknownError: 'Une erreur inconnue est survenue',
    goHome: "Retour à l'accueil",
    retry: 'Réessayer',
    notFound: 'Page introuvable',
    notFoundDescription: "La page que vous cherchez n'existe pas.",
    backTo: 'Retour à {{section}}',
    restricted: 'Accès restreint',
    restrictedDescription: "Vous n'avez pas accès à cette page.",
    api: {
      UNKNOWN: 'Une erreur inattendue est survenue.',
      NETWORK:
        'Impossible de se connecter au serveur. Vérifiez votre connexion.',
      UNAUTHORIZED: 'Vous n’êtes pas connecté. Connectez-vous et réessayez.',
      FORBIDDEN: "Vous n'avez pas les droits pour effectuer cette action.",
      NOT_FOUND: 'La ressource demandée est introuvable.',
      VALIDATION:
        'Certaines données envoyées sont invalides. Vérifiez-les et réessayez.',
      CONFLICT:
        'Cette action entre en conflit avec l’état actuel. Actualisez et réessayez.',
      RATE_LIMITED: 'Trop de requêtes. Patientez un instant et réessayez.',
      SERVER_ERROR: 'Le serveur a rencontré une erreur. Réessayez plus tard.',
      GRAPHQL_ERROR: 'La requête n’a pas pu aboutir. Réessayez.',
    },
  },
  Sign: {
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    continue: 'Continuer',
    resend: "Vous n'avez pas reçu de code ? Renvoyer",
    In: {
      title: 'Connexion',
      subTitle: 'Bienvenue ! Veuillez vous connecter pour continuer',
      signUpLink: "Vous n'avez pas de compte ? Inscrivez-vous",
      forgotPassword: 'Mot de passe oublié ?',
      signUp: 'Inscription',
      welcomeBack: 'Bon retour',
      goBack: 'Retour',
      ChooseStrategy: {
        title: 'Utiliser une autre méthode',
        description:
          "Vous rencontrez des problèmes ? Vous pouvez utiliser l'une de ces méthodes pour vous connecter.",
        emailCode: 'Code par e-mail',
      },
      Verifications: {
        title: 'Vérifiez votre e-mail',
        subTitle:
          'Entrez le code de vérification envoyé à votre adresse e-mail',
        anotherMethod: 'Utiliser une autre méthode',
        Password: {
          title: 'Entrez votre mot de passe',
        },
        EmailCode: {
          title: 'Vérifiez votre e-mail',
          subTitle:
            'Entrez le code de vérification envoyé à votre adresse e-mail',
          emailVerification: 'Code de vérification par e-mail',
        },
      },
      ForgotPassword: {
        title: 'Mot de passe oublié ?',
        resetPassword: 'Réinitialiser le mot de passe',
      },
      ResetPassword: {
        title: 'Réinitialiser le mot de passe',
        subTitle: 'Entrez votre nouveau mot de passe',
        confirmPassword: 'Confirmer le mot de passe',
        confirm: 'Confirmer',
      },
    },
    Up: {
      title: 'Inscription',
      subTitle: 'Bienvenue ! Veuillez remplir les détails pour commencer.',
      signInLink: 'Vous avez déjà un compte ? Connectez-vous',
      Continue: {
        title: "Poursuivre l'inscription",
        username: "Nom d'utilisateur",
      },
      Verifications: {
        title: 'Vérifiez votre e-mail',
        subTitle:
          'Utilisez le lien de vérification envoyé à votre adresse e-mail',
      },
    },
  },
  Pages: {
    Dashboard: {
      title: 'Tableau de bord',
      subtitle:
        'Vue de sante operationnelle des clients, licences, releases et automatisations',
      loading: 'Chargement...',
      errorLoadingData: 'Erreur lors du chargement du tableau de bord',
      refreshingInsights: 'Actualisation des insights complementaires...',
      customers: 'Clients',
      instances: 'Instances',
      licenses: 'Licences',
      expiringIn60Days: 'Expiration sous 60 jours',
      stats: {
        customers: 'Clients',
        activeInstances: 'Instances actives',
        expiringIn60Days: 'Expiration sous 60 jours',
        expiringIn60DaysHelper: '{{count}} sous 60 jours',
        expiringIn30Days: 'Expiration sous 30 jours',
        licenses: 'Licences',
        featureFlagsEnabled: 'Feature flags actives',
        tokensExpiringSoon: 'Tokens bientot expires',
        totalTokens_one: '{{count}} token au total',
        totalTokens_other: '{{count}} tokens au total',
        activeTokens_one: '{{count}} token actif',
        activeTokens_other: '{{count}} tokens actifs',
      },
      insights: {
        entitlementAlerts: {
          title: 'Droits proches du seuil',
          description_one: '{{count}} droit depasse la limite',
          description_other: '{{count}} droits depassent la limite',
          currentPeriod_one:
            '{{count}} d\u2019entre eux se réinitialise avec sa fenêtre en cours',
          currentPeriod_other:
            '{{count}} d\u2019entre eux se réinitialisent avec leur fenêtre en cours',
        },
        releaseCoverage: {
          title: 'Couverture des releases',
          description:
            'Zones actuellement rattachees a une version de release.',
        },
        automationSurface: {
          title: 'Surface d automatisation',
          description_one: '{{count}} token sur les comptes de service',
          description_other: '{{count}} tokens sur les comptes de service',
        },
      },
      chartLabels: {
        instances: 'Instances',
        created: 'Creees',
        started: 'Demarrees',
        ending: 'En fin de licence',
        enabled: 'Activees',
        disabled: 'Desactivees',
        flags: 'Flags',
        releases: 'Releases',
        zones: 'Zones',
        healthy: 'Sains',
        expiringSoon: 'Expiration proche',
        expired: 'Expires',
        revoked: 'Revoques',
        noExpiry: 'Sans expiration',
        tokens: 'Tokens',
      },
      charts: {
        emptyState: 'Aucune donnee disponible pour ce graphique.',
        licenseExpirationForecast: {
          title: 'Projection des expirations de licence',
          description:
            'Fenetre d expiration projetee pour les instances actives',
          buckets: {
            zeroToSevenDays: '0-7 j',
            eightToThirtyDays: '8-30 j',
            thirtyOneToSixtyDays: '31-60 j',
            sixtyOneToNinetyDays: '61-90 j',
            overNinetyDays: '90+ j',
          },
        },
        topCustomersByInstances: {
          title: 'Clients avec le plus d instances actives',
          description: 'Empreintes client les plus importantes',
        },
        tokenSecurityPosture: {
          title: 'Posture de securite des tokens',
          description:
            'Repartition actuelle des etats du cycle de vie des tokens',
          emptyState: 'Aucun token de compte de service disponible',
          singleState_one: 'Le seul token est {{state}}',
          singleState_other: 'Les {{count}} tokens sont tous {{state}}',
        },
        instanceLifecycleTimeline: {
          title: 'Chronologie du cycle de vie des instances',
          description:
            'Evenements mensuels de creation, demarrage et fin de licence',
        },
        releaseCadence: {
          title: 'Cadence des releases',
          description: 'Releases creees par mois',
          emptyState: 'Aucune release disponible',
        },
        releaseCoverageByZone: {
          title: 'Couverture des releases par zone',
          description:
            'Zones de deploiement rattachees aux versions de release',
          emptyState: 'Aucune zone de deploiement disponible',
          unassigned: 'Non assignee',
          allUnassigned_one: "La seule zone n'a pas encore de release",
          allUnassigned_other:
            'Aucune des {{count}} zones ne fait encore tourner de release',
        },
        flagTargetingComplexity: {
          title: 'Complexite du ciblage des flags',
          description: 'Nombre de regles configurees par flag',
        },
        featureFlagsGovernance: {
          title: 'Gouvernance des feature flags',
          description: 'Repartition activation et distribution par type',
          emptyState: 'Aucune feature flag disponible',
          allEnabled_one: 'La seule feature flag est activee',
          allEnabled_other: 'Les {{count}} feature flags sont toutes activees',
          allDisabled_one: 'La seule feature flag est desactivee',
          allDisabled_other:
            'Les {{count}} feature flags sont toutes desactivees',
        },
        entitlementSaturationHeatmap: {
          title: 'Heatmap de saturation des droits',
          description:
            "Charge d'usage par type de licence et bande de seuil, séparée par portée du compteur",
          emptyState: 'Aucune donnee d usage de droit disponible',
          licenseTypeAndScope: 'Type de licence et portée',
          scopes: {
            LIFETIME: 'Total à vie',
            PERIODIC: 'Fenêtre en cours',
          },
          bands: {
            under50: '<50%',
            between50And80: '50-80%',
            between80And100: '80-100%',
            over100: '>100%',
            unbounded: 'Sans limite',
          },
        },
      },
    },
    Customers: {
      title: 'Clients',
      subtitle: 'Clients finaux et leurs instances',
      Tabs: {
        customers: 'Clients',
        instances: 'Instances',
        hosts: 'Hôtes',
      },
      Table: {
        Columns: {
          name: 'Nom',
          externalId: 'ID Externe',
          domain: 'Domaine',
          crmSync: 'Synchro CRM',
          instances: 'Instances',
          customerName: 'Nom du client',
          licenseType: 'Type de license',
          features: 'Fonctionnalités',
          host: 'Hôte',
          plan: 'Plan',
        },
        warningDelete:
          "Certaines instances sont toujours associées à ce client.\nVous devez d'abord mettre à jour leur client pour vous assurer qu'aucune instance reste liée au client actuel",
        instanceCount_one: '{{count}} instance',
        instanceCount_other: '{{count}} instances',
        Dialogs: {
          instancesTitle: 'Instances pour ce client',
          instancesDescription: 'Déploiements actifs liés à ce client.',
          Columns: {
            instance: 'Instance',
            licenseType: 'Type de licence',
          },
        },
      },
      Detail: {
        editName: 'Modifier le nom',
        customerDetails: {
          title: 'Détails du client',
          description: 'Nom, lien CRM et dates d’audit.',
          fields: {
            name: 'Nom',
            externalId: 'ID externe',
            domain: 'Domaine',
            billingEmail: 'E-mail de facturation',
            createdAt: 'Créé le',
            updatedAt: 'Mis à jour le',
          },
          by: 'par',
          billingEmailNone: 'Non renseigné',
        },
        Billing: {
          Invoices: {
            description:
              'Les factures de toutes les instances de ce client, de la plus récente à la plus ancienne.',
            empty: 'Aucune instance de ce client n’a encore été facturée.',
          },
        },
        instances: {
          title: 'Instances',
          description: 'Déploiements de ce client.',
          empty: 'Aucune instance trouvée pour ce client.',
          columns: {
            name: 'Nom',
            license: 'Licence',
            type: 'Type',
            status: 'Statut',
            lifecycle: 'Cycle de vie',
            start: 'Début',
            end: 'Fin',
          },
        },
      },
      Mutation: {
        titleNew: 'Nouveau Client',
        titleUpdate: 'Modifier le Client',
        deleteSuccess: 'Client supprimé avec succès',
        Form: {
          Labels: {
            name: 'Nom',
            customId: 'ID externe',
            domain: 'Domaine',
            slug: 'Slug',
            billingEmail: 'E-mail de facturation',
          },
          Placeholders: {
            name: 'Acme Inc.',
            customId: 'ID HubSpot',
            domain: 'acme.com',
            slug: 'acme-inc',
            billingEmail: 'facturation@acme.com',
          },
          Descriptions: {
            name: "L'entreprise ou l'organisation, telle que votre équipe la connaît.",
            customId:
              "Relie ce client à sa fiche dans vos propres systèmes, comme Salesforce ou HubSpot. Il n'a pas besoin d'être unique.",
            domain:
              'Domaine principal du client (ex: acme.com). Optionnel, utilisé notamment par les intégrations CRM.',
            slug: 'Généré automatiquement — modifiable.',
            slugLocked:
              'Défini à la création du client, il ne peut plus changer.',
            billingEmail:
              'L’adresse que portent les factures de ce client, pour votre comptabilité. Facultatif : videz le champ pour la retirer.',
          },
          Errors: {
            name: 'Le nom est requis',
            domain:
              'Le domaine doit être un nom de domaine valide (ex: acme.com)',
            billingEmail:
              'Saisissez une adresse e-mail valide, par exemple facturation@acme.com',
            billingEmailTooLong:
              'L’adresse e-mail est trop longue (254 caractères au plus)',
          },
          createSuccess: 'Client créé avec succès',
          updateSuccess: 'Client mis à jour avec succès',
          createButton: 'Créer le Client',
          updateButton: 'Mettre à jour le Client',
        },
      },
      Instances: {
        title: 'Instances',
        subtitle: 'Instances déployées sur tous les clients',
        confirmDeleteTitle: 'Supprimer cette instance ?',
        confirmDeleteDescription:
          'Cette action supprimera définitivement {{name}} ainsi que toutes les données associées — historique d’utilisation, métriques rapportées et liens d’intégration. Cette action est irréversible.',
        Table: {
          Columns: {
            name: 'Nom',
            description: 'Description',
            customer: 'Client',
            crmSync: 'Synchro CRM',
            license: 'Licence',
            status: 'Statut',
            lifecycleStage: 'Cycle de vie',
            metadata: 'Métadonnées',
            extraMetadata: 'Métadonnées hors schema',
            customerName: 'Nom du client',
            licenseType: 'Type de licence',
            features: 'Fonctionnalités',
            host: 'Hôte',
            plan: 'Plan',
          },
          Dialogs: {
            metadataTitle: "Métadonnées de l'instance",
            metadataDescription:
              "Métadonnées opérationnelles renvoyées par le contrat de l'API instance.",
            metadataTrigger: "Ouvrir les métadonnées de l'instance",
            extraMetadataTitle: 'Métadonnées hors schema',
            extraMetadataDescription:
              'Valeurs reportées sur cette instance qui ne sont couvertes par aucun schema de metadata field actif.',
            extraMetadataTrigger: 'Ouvrir les métadonnées hors schema',
          },
        },
        Mutation: {
          titleNew: 'Nouvelle Instance',
          titleUpdate: "Modifier l'Instance",
          deleteSuccess: 'Instance supprimée avec succès',
          Form: {
            mainTitle: 'Informations principales',
            licenseTitle: 'Licence',
            Labels: {
              name: 'Nom',
              description: 'Description',
              customerId: 'Nom du client',
              slug: 'Slug',
              licenseId: 'Licence',
              licenseKey: 'Version de la licence',
              licenseDate: 'Date de licence',
              deploymentZoneId: 'Zone de déploiement',
            },
            Placeholders: {
              name: 'Acme Production',
              description: 'Instance de production Acme Inc.',
              customerId: 'Sélectionner un client',
              customerIdSearch: 'Rechercher un client',
              slug: 'acme-production',
              licenseId: 'Sélectionner une licence',
              licenseKey: 'Sélectionner une version',
              deploymentZoneId: 'Sélectionner une zone de déploiement',
              deploymentZoneIdSearch: 'Rechercher une zone de déploiement',
              noDeploymentZone: 'Aucune zone de déploiement',
            },
            Descriptions: {
              name: 'Distingue ce déploiement, par exemple par son environnement.',
              customerId: 'Le client auquel appartient cette instance.',
              slug: 'Généré automatiquement — modifiable.',
              licenseId:
                'La version de licence qui fixe les droits de cette instance. Les versions archivées ne sont plus proposées.',
              licenseKey: "La version de cette licence qu'utilise l'instance.",
              licenseDate: "Date d'expiration de la licence",
              deploymentZoneId:
                'Optionnel. Laissez vide pour créer l’instance sans zone et la déployer plus tard.',
            },
            LicenseOptions: {
              label: '{{name}} v{{version}}',
              draft: '{{label}} (brouillon)',
              archived: '{{label}} (archivée)',
            },
            Steps: {
              instanceInformations: "Informations de l'instance",
              chooseLicense: 'Choisir la licence',
              deployment: 'Déploiement',
              metadata: 'Métadonnées',
            },
            createButton: "Créer l'Instance",
            updateButton: "Mettre à jour l'Instance",
            createSuccess: 'Instance créée avec succès',
            updateSuccess: 'Instance mise à jour avec succès',
            updateError: "Erreur lors de la mise à jour de l'instance",
          },
        },
        Deployment: {
          deployAction: 'Déployer',
          migrateAction: 'Migrer',
          deployTitle: 'Déployer {{name}}',
          migrateTitle: 'Migrer {{name}}',
          deployDescription:
            'Cette instance n’a pas encore de zone de déploiement. Choisissez celle sur laquelle elle doit tourner.',
          migrateDescription:
            'Déplacez cette instance vers une autre zone de déploiement. Elle reprendra la release déployée sur la zone cible.',
          currentZone: 'Zone de déploiement actuelle',
          targetZone: 'Zone de déploiement',
          targetZonePlaceholder: 'Sélectionner une zone de déploiement',
          noZoneAvailable: 'Aucune autre zone de déploiement n’est disponible.',
          deploySuccess: 'Instance déployée avec succès',
          migrateSuccess: 'Instance migrée avec succès',
        },
        Detail: {
          editName: 'Modifier le nom',
          Billing: {
            loading: 'Chargement de la facturation',
            NotSubscribed: {
              title: 'Non abonnée',
              description:
                'Aucun abonnement ne facture encore cette instance. Souscrivez-la à un prix de sa licence pour commencer à facturer.',
            },
            Subscribe: {
              title: 'Souscrire',
              open: 'Souscrire',
              dialogTitle: 'Souscrire un abonnement pour {{name}}',
              description:
                'Rattachez cette instance à un prix de sa licence et commencez à la facturer. Les factures sont enregistrées ici puis transmises à votre propre système.',
              confirm: 'Souscrire',
              provider: 'Fournisseur de paiement',
              providerHint:
                'Les factures sont enregistrées ici puis transmises à votre ERP. Rien n’est encaissé auprès du client.',
              basePrice: 'Prix de base',
              basePriceHint:
                'Le forfait auquel cet abonnement est rattaché. Seuls les forfaits actifs de la version de licence sont proposés.',
              priceOption: '{{label}} · {{price}} · {{timing}}',
              daysUntilDue: 'Délai de paiement (jours)',
              daysUntilDueHint:
                'Nombre de jours entre l’émission d’une facture et son échéance. Laissez vide pour appliquer le délai de votre organisation.',
              daysUntilDuePlaceholder: 'Défaut de l’organisation : {{days}}',
              daysUntilDuePlaceholderUnknown: 'Défaut de l’organisation',
              startAt: 'Début de la facturation (UTC)',
              startAtHint:
                'Laissez vide pour démarrer maintenant. Un contrat commencé plus tôt peut démarrer jusqu’à une période de facturation en arrière, jamais dans le futur.',
              licenseNotPublished:
                'Cette instance utilise {{name}} v{{version}} ({{state}}). Seule une version de licence publiée peut faire l’objet d’un abonnement.',
              licenseNotPublishedDialog:
                '{{name}} v{{version}} n’est pas publiée, et seule une version de licence publiée peut faire l’objet d’un abonnement. Passez d’abord l’instance sur une version publiée.',
              noBasePrice:
                '{{name}} v{{version}} n’a aucun forfait actif auquel souscrire. Ajoutez-en un sur la licence d’abord.',
              Summary: {
                now: 'La première facture est émise dès le démarrage de l’abonnement.',
                arrears:
                  'Rien n’est facturé avant la clôture de la première période : la première facture est émise le {{date}}.',
                arrearsDue:
                  'La première période s’est déjà close le {{date}} : sa facture est émise peu après le démarrage de l’abonnement.',
              },
              Started: {
                title: 'Abonnement démarré',
                period: 'Période en cours :',
                activation: 'Facture d’activation :',
                viewInvoice: 'Voir la facture',
                noActivation:
                  'Rien n’est encore facturé : la première facture est émise le {{date}}.',
              },
              BillingEmail: {
                title: '{{customer}} n’a pas d’e-mail de facturation',
                description:
                  'Les factures portent cette adresse pour votre comptabilité. Renseignez-la maintenant, ou plus tard depuis la page du client.',
                label: 'E-mail de facturation',
                placeholder: 'facturation@exemple.fr',
                save: 'Enregistrer l’e-mail',
                saved: 'E-mail de facturation enregistré',
              },
              Errors: {
                basePrice: 'Choisissez un prix de base',
                daysUntilDue: 'Saisissez un nombre entier de jours, de 0 à 365',
                startAt: 'Saisissez une date et une heure valides',
                startAtFuture:
                  'La facturation ne peut pas démarrer dans le futur',
                startAtTooEarly:
                  'La facturation ne peut pas démarrer plus d’une période de facturation en arrière',
              },
            },
            Subscription: {
              title: 'Abonnement',
              description: 'La façon dont cette instance est facturée.',
              descriptionEnded:
                'Cet abonnement est terminé. Souscrivez à nouveau pour reprendre la facturation de l’instance.',
              fields: {
                status: 'Statut',
                pastDueSince: 'En retard depuis',
                provider: 'Fournisseur',
                collection: 'Encaissement',
                terms: 'Délai de paiement',
                basePrice: 'Prix de base',
                currentPeriod: 'Période en cours',
                canceledAt: 'Annulé le',
                cancellationReason: 'Motif',
                nextBoundary: 'Prochaine échéance',
                startedAt: 'Démarré le',
              },
              collectionMethod: {
                CHARGE_AUTOMATICALLY: 'Prélevé automatiquement',
                SEND_INVOICE: 'Facture envoyée au client',
              },
              termsSource: {
                contract: 'Ce contrat',
                organization: 'Défaut de l’organisation',
              },
              daysUntilDue_one: 'Payable sous {{count}} jour',
              daysUntilDue_other: 'Payable sous {{count}} jours',
              priceLine: '{{price}} · {{timing}}',
              nextBoundaryHint:
                'La période se termine alors et sa facture est composée.',
            },
            Upcoming: {
              title: 'Prochaine facture',
              description:
                'Ce que la prochaine échéance émettra, composé d’après l’usage à ce jour. Rien n’est enregistré ni facturé.',
              loading: 'Chargement de la prochaine facture',
              view: 'Voir les lignes',
              kind: 'Type',
              issuedAt: 'Émise le',
              period: 'Période de service',
              lines: 'Lignes',
              lineCount_one: '{{count}} ligne',
              lineCount_other: '{{count}} lignes',
              total: 'Total',
              asOf: 'Composée {{date}} d’après l’usage à ce jour.',
              dialogTitle: 'Prochaine facture',
              dialogDescription:
                'La facture que la prochaine échéance émettrait. C’est un aperçu : rien n’est enregistré, envoyé ni facturé.',
              WouldHold: {
                title: 'Cette facture serait bloquée',
                description:
                  'Le journal d’usage de ces compteurs échoue à un contrôle, et la facturation n’émet pas une facture dont elle ne peut pas répondre :',
                item: '{{entitlement}} : {{reason}}.',
                unknownEntitlement: 'Un droit',
                history: 'Voir son historique d’usage',
              },
            },
            Invoices: {
              description:
                'Toutes les factures de cette instance, sur l’ensemble des périodes où elle a été abonnée, de la plus récente à la plus ancienne.',
              empty: 'Aucune facture n’a encore été émise pour cette instance.',
            },
          },
          tabs: {
            overview: 'Overview',
            entitlements: 'Entitlements & Usage',
            billing: 'Facturation',
            auditTrail: 'Journal d’audit',
          },
          status: {
            healthy: 'Saine',
            degraded: 'Dégradée',
            incident: 'Incident',
            maintenance: 'Maintenance',
          },
          lifecycleStage: {
            trial: 'Essai',
            active: 'Actif',
            atRisk: 'À risque',
            churned: 'Perdu',
          },
          fallback: {
            unknownCustomer: 'Client inconnu',
            unknownLicense: 'Licence inconnue',
          },
          quickStats: {
            licenseExpires: 'Expiration licence',
            instanceStatus: "Statut de l'instance",
            entitlements: 'Droits',
            entitlementsUnderLimit: 'sous leur limite',
            licenseType: 'Type de licence',
            usageAlerts: "Alertes d'utilisation",
            nearLimit: 'proches de la limite',
            limitReached_one: 'limite atteinte',
            limitReached_other: 'limites atteintes',
            nearLimitCurrentPeriod_one:
              '{{count}} se réinitialise avec sa fenêtre en cours',
            nearLimitCurrentPeriod_other:
              '{{count}} se réinitialisent avec leur fenêtre en cours',
            days: 'jours',
            expired: 'Expirée',
            unknown: 'Inconnu',
          },
          instanceDetails: {
            title: "Détails de l'instance",
            description: 'Informations générales sur cette instance',
          },
          statusEditor: {
            title: 'Statut opérationnel',
            label: 'Statut',
            changed: 'Statut passé à {{status}}',
          },
          lifecycleStageEditor: {
            title: 'Cycle de vie commercial',
            label: 'Cycle de vie',
            placeholder: 'Sélectionner ou saisir une étape',
            searchPlaceholder: 'Rechercher ou créer une étape',
            none: 'Aucun cycle de vie',
          },
          fields: {
            name: 'Nom',
            description: 'Description',
            customer: 'Client',
            instanceId: "ID de l'instance",
          },
          license: {
            title: 'Licence',
            plan: 'Plan',
            type: 'Type',
            version: 'Version',
            period: 'Période de licence',
          },
          metadata: {
            title: 'Métadonnées',
            description:
              'Valeurs déclarées par votre schéma de metadata fields',
            empty: 'Aucun metadata field déclaré',
            emptyHelper:
              'Déclarez des metadata fields d’instance dans les paramètres pour les voir ici.',
            extra: 'Métadonnées hors schema',
          },
          release: {
            title: 'Release',
            description: 'Release actuellement déployée sur cette instance',
            version: 'Version',
            status: 'Statut',
            deploymentZone: 'Zone de déploiement',
            deployedAt: 'Déployée le',
            empty: {
              title: 'Pas encore déployée',
              description:
                'Cette instance n’est rattachée à aucune zone de déploiement. Déployez-la pour voir la release qu’elle exécute.',
            },
          },
          audit: {
            createdAt: 'Créée',
            updatedAt: 'Dernière mise à jour',
            by: 'par',
          },
          links: {
            viewLicense: 'Voir la licence',
            openRelease: 'Ouvrir la release',
            viewDeploymentZone: 'Voir la zone de déploiement',
          },
          entitlements: {
            unknownEntitlement: 'Droit inconnu',
            empty: "Aucune donnée d'utilisation des droits",
            unlimited: 'Illimité',
            softLimitHint: '(+{{percent}} % de dépassement)',
            softLimitDescription:
              "Limite souple : l'utilisation est acceptée jusqu'à {{max}} avant d'être rejetée.",
            lifetime: 'À vie',
            periodRange: '{{start}} → {{end}}',
            filters: {
              allGroups: 'Tous les groupes',
              clear: 'Effacer le filtre',
              groupLabel: 'Filtrer les droits par groupe',
            },
            usage: {
              title: "Vue d'ensemble de l'utilisation",
              description:
                'Vue visuelle de la consommation des droits pour cette instance',
              currentWindow: 'Fenêtre courante : {{start}} → {{end}}',
            },
            table: {
              title: 'Tous les droits',
              description:
                'Vue détaillée de tous les droits associés via la licence',
              headers: {
                entitlement: 'Droit',
                type: 'Type',
                usage: 'Utilisation',
                threshold: 'Seuil',
                currentPeriod: 'Fenêtre courante',
                status: 'Statut',
              },
            },
            status: {
              enabled: 'Activé',
              disabled: 'Désactivé',
              unknown: 'Inconnu',
            },
          },
          auditTrail: {
            stats: {
              totalEvents: 'Total des événements',
              read: 'Lectures',
              accepted: 'Acceptés',
              rejected: 'Rejetés',
              warnings: 'Avertissements',
              today: "Aujourd'hui",
            },
            charts: {
              activityTimeline: {
                title: "Chronologie d'activité",
                description:
                  "Événements d'accès aux droits sur la dernière période",
                allEntitlements: 'Tous les droits',
                allGroups: 'Tous les groupes',
                empty: "Aucune donnée d'activité pour cette période",
                entitlementFilterLabel: 'Filtrer la chronologie par droit',
                groupFilterLabel: 'Filtrer la chronologie par groupe',
                modeLabel: "Changer le mode de la chronologie d'activité",
                modes: {
                  status: 'Par statut',
                  group: 'Par groupe',
                },
                showLabel: 'Afficher :',
                visibleGroupsLabel: 'Groupes visibles',
                visibleGroupsPlaceholder: 'Groupes visibles',
                visibleGroupsSearchPlaceholder: 'Rechercher des groupes',
                visibleGroupsEmpty: 'Aucun groupe correspondant',
                visibleGroupsCount_one: '{{count}} groupe visible',
                visibleGroupsCount_other: '{{count}} groupes visibles',
                series: {
                  read: 'Lecture',
                  accepted: 'Accepté',
                  rejected: 'Rejeté',
                  warning: 'Avertissement',
                },
              },
              valueOverTime: {
                title: 'Valeur dans le temps',
                description:
                  "Suivez l'évolution de la valeur d'un droit numérique à travers les événements d'audit",
                currentLabel: 'Actuel :',
                currentTotalLabel: 'Total à vie actuel :',
                empty: 'Aucune donnée numérique pour ce droit',
                emptyGroup: 'Aucune donnée numérique pour ce groupe',
                groupBadge: 'Groupe',
                groupFilterLabel: 'Sélectionner un groupe numérique',
                groupTotalLabel: 'Total du groupe (compteurs à vie)',
                noGroupTotal:
                  'Aucun compteur à vie à totaliser dans ce groupe. Sélectionnez des droits pour les tracer individuellement.',
                periodicBadge: 'Réinitialisé par fenêtre',
                periodicSuffix: 'par fenêtre',
                modeLabel: 'Changer le mode de la valeur dans le temps',
                modes: {
                  entitlement: 'Par droit',
                  group: 'Par groupe',
                },
                numericEntitlementsCount_one: '{{count}} droit numérique',
                numericEntitlementsCount_other: '{{count}} droits numériques',
                allEntitlements: 'Tous les droits',
                selectAll: 'Tout sélectionner',
                clearIndividualLines: 'Masquer les lignes individuelles',
                entitlementFilterLabel: 'Sélectionner un droit numérique',
                visibleEntitlementsEmpty: 'Aucun droit correspondant',
                visibleEntitlementsLabel: 'Droits visibles',
                visibleEntitlementsSearchPlaceholder: 'Rechercher des droits',
                visibleEntitlementsCount_one: '{{count}} droit visible',
                visibleEntitlementsCount_other: '{{count}} droits visibles',
                visibleEntitlementLinesCount_one:
                  '{{count}} ligne de droit affichée',
                visibleEntitlementLinesCount_other:
                  '{{count}} lignes de droit affichées',
                valueLabel: 'Valeur',
              },
            },
            table: {
              title: 'Journal des événements',
              description:
                'Enregistrement immuable de toutes les opérations de droits sur cette instance',
              autoRefresh: 'Actualisation automatique',
              searchPlaceholder: 'Rechercher par droit, événement...',
              empty: "Aucune entrée d'audit trouvée",
              actions: {
                viewDetails: 'Voir les détails',
              },
              headers: {
                id: '#',
                event: 'Événement',
                entitlement: 'Droit',
                status: 'Statut',
                timestamp: 'Horodatage',
              },
              filters: {
                allEvents: 'Tous les événements',
                allGroups: 'Tous les groupes',
                allStatuses: 'Tous les statuts',
                accepted: 'Accepté',
                clear: 'Effacer les filtres',
                eventFilterLabel: 'Filtrer par événement',
                groupFilterLabel: 'Filtrer par groupe',
                read: 'Lecture',
                rejected: 'Rejeté',
                resultsCount_one: '{{count}} résultat',
                resultsCount_other: '{{count}} résultats',
                statusFilterLabel: 'Filtrer par statut',
                warning: 'Avertissement',
              },
            },
            detail: {
              eventId: "ID de l'événement",
              status: 'Statut',
              timestamp: 'Horodatage',
              instance: 'Instance',
              eventName: "Nom de l'événement",
              entitlement: 'Droit',
              fullPayload: 'Payload complet',
            },
            howItWorks: {
              title: "Comment fonctionne l'audit trail",
              items: {
                entitlementRead: {
                  title: 'Lecture de droit',
                  description:
                    "Chaque lecture d'une valeur de droit via l'API Data Plan enregistre un événement avec la valeur courante.",
                },
                usageAccepted: {
                  title: 'Usage accepté',
                  description:
                    'Quand un client remonte un usage et que le nouveau total reste sous le seuil configuré, le rapport est accepté.',
                },
                usageRejected: {
                  title: 'Usage rejeté',
                  description:
                    "Si l'usage remonté dépasse le seuil configuré, l'opération est rejetée et l'usage n'est pas persisté.",
                },
              },
            },
          },
        },
      },
    },
    Licenses: {
      title: 'Licences',
      subtitle: 'Gérez les licences et les limites de droits',
      Freeze: {
        billed: {
          title: 'Cette version est facturée',
          description:
            'Un abonnement actif facture cette version : ses droits et ses prix sont gelés, car les modifier changerait un contrat déjà vendu. Créez une nouvelle version pour changer ce qui est vendu. Elle part des droits et des prix de celle-ci, en brouillon modifiable, et les abonnements restent sur cette version jusqu’à ce qu’ils passent à la nouvelle.',
        },
        published: {
          title: 'Les prix d’une version publiée sont immuables',
          description:
            'Dépréciez un prix pour le retirer, ou créez une nouvelle version pour changer ce qui est vendu. La nouvelle version part des droits et des prix de celle-ci, en brouillon modifiable.',
        },
        archived: {
          title: 'Cette version n’accepte aucun nouveau prix',
          description:
            'Une version retirée de la vente n’accepte aucun nouveau prix. Créez une nouvelle version pour changer ce qui est vendu. Elle part des droits et des prix de celle-ci, en brouillon modifiable.',
        },
        createNewVersion: 'Créer une nouvelle version',
      },
      PriceCopy: {
        title: 'La copie des prix s’est arrêtée',
        description:
          'Les prix de {{name}} v{{version}} étaient copiés vers cette version, et {{copied}} sur {{total}} sont passés. Le reste peut être copié à partir de là où elle s’est arrêtée. Rien n’a été supprimé, et rien n’a été modifié sur {{name}} v{{version}}.',
        copiedHeading: 'Copiés',
        pendingHeading: 'Restent à copier',
        resume: 'Reprendre la copie',
        Toasts: {
          done: 'Prix copiés',
        },
      },
      Commercial: {
        cardTitle: 'Conditions commerciales',
        cardDescription: 'Comment cette version est vendue.',
        dialogTitle: 'Modifier les conditions commerciales',
        dialogDescription:
          'Comment {{name}}, version {{version}}, est vendue. Rien d’autre ne change dans la version.',
        Fields: {
          pricingType: 'Type de tarification',
          trial: 'Essai gratuit',
          paymentMethod: 'Moyen de paiement',
          ctaUrl: 'URL d’appel à l’action',
        },
        PricingTypes: {
          FREE: 'Gratuit',
          PAID: 'Payant',
          CUSTOM: 'Sur mesure',
        },
        Values: {
          noTrial: 'Pas d’essai',
          trialDays_one: '{{count}} jour',
          trialDays_other: '{{count}} jours',
          paymentRequired: 'Saisi à l’inscription',
          paymentNotRequired: 'Non requis',
        },
        Form: {
          save: 'Enregistrer',
          Labels: {
            pricingType: 'Type de tarification',
            trial: 'Durée de l’essai (jours)',
            paymentMethod: 'Exiger un moyen de paiement à l’inscription',
            ctaUrl: 'URL d’appel à l’action',
          },
          Descriptions: {
            pricingType:
              'Une version gratuite ou payante peut être achetée en libre-service ; une version sur mesure envoie l’acheteur vers l’URL d’appel à l’action ou vers une conversation.',
            trial:
              'Un abonnement à cette version démarre avec cet essai. Laissez vide pour aucun essai.',
            paymentMethod:
              'L’inscription en libre-service saisit un moyen de paiement avant de s’activer.',
            ctaUrl:
              'Où l’acheteur est envoyé quand cette version ne peut pas être achetée en libre-service : une URL http ou https de 2 048 caractères au plus. Laissez vide pour aucune.',
          },
          Placeholders: {
            trial: '14',
            ctaUrl: 'https://acme.test/contact',
          },
          Errors: {
            trialMin: 'Doit être d’au moins 1',
            trialWhole: 'Saisissez un nombre entier de jours',
            urlScheme: 'Saisissez une URL http ou https',
            urlLength: '2 048 caractères au plus',
          },
        },
        Toasts: {
          updated: 'Conditions commerciales mises à jour',
        },
      },
      Prices: {
        title: 'Prix',
        tabDescription:
          'Un prix est une chose facturable, et devient une ligne de facture.',
        defaultBadge: 'Par défaut',
        deprecatedOn: 'Déprécié le {{date}}',
        Summary: {
          empty: 'Aucun prix actif pour l’instant',
          or: 'ou',
          overage: '{{price}} au-delà de l’allocation',
        },
        Notes: {
          draft:
            'Les prix d’un brouillon se modifient. Une fois la version publiée, ils deviennent immuables : dépréciez-en un, ou créez une nouvelle version pour changer ce qui est vendu.',
          published:
            'Les prix d’une version publiée sont immuables. Dépréciez un prix pour le retirer, ou créez une nouvelle version pour changer ce qui est vendu. Un prix peut encore être ajouté tant qu’aucun abonnement ne facture cette version.',
          archived:
            'Cette version est retirée de la vente. Ses prix sont immuables et elle n’accepte aucun nouveau prix ; les abonnements qui la facturent continuent de l’être.',
        },
        Meter: {
          overage:
            'Facture au-delà de {{limit}} {{unit}}/{{period}}, jusqu’à {{cap}}',
          overageUnknown:
            'Facture l’usage au-delà de l’allocation accordée par la version',
          usageSum: 'Somme, remis à zéro chaque {{period}}',
          usageCount: 'Décompte, remis à zéro chaque {{period}}',
        },
        Actions: {
          add: 'Ajouter un prix',
          edit: 'Modifier',
          editAria: 'Modifier {{label}}',
          deprecate: 'Déprécier',
          deprecateAria: 'Déprécier {{label}}',
        },
        Drawer: {
          titleNew: 'Nouveau prix',
          titleEdit: 'Modifier le prix',
          description:
            '{{name}}, version {{version}}. Un prix devient une ligne de facture.',
          create: 'Créer le prix',
          update: 'Enregistrer le prix',
        },
        Form: {
          Labels: {
            model: 'Forme',
            timing: 'Moment de facturation',
            period: 'Période de facturation',
            currency: 'Devise',
            label: 'Libellé sur la facture',
            meter: 'Droit mesuré',
            amount: 'Montant',
            amountPer: 'Montant par {{unit}}',
            isDefault: 'Prix par défaut de cette période',
          },
          Descriptions: {
            modelLocked:
              'La forme d’un prix ne change plus une fois créé. Dépréciez-le et ajoutez-en un autre pour la changer.',
            timingLocked:
              'Un prix mesuré est toujours facturé à terme échu : l’usage ne peut pas être facturé avant d’avoir eu lieu.',
            period: 'À quelle fréquence le montant est facturé.',
            currency:
              'Une version facture dans une seule devise, fixée par son premier prix.',
            currencyLocked:
              'Cette version facture en {{currency}}, devise fixée par son premier prix.',
            label:
              'Le nom de la ligne sur la facture. Laissé vide, Kaiten en déduit un.',
            amountFlat:
              'Facturé une fois par période. Saisissez le montant dans l’unité de la devise (par exemple 49,00).',
            amountUsage:
              'Appliqué dès la première unité. Saisissez le montant dans l’unité de la devise (par exemple 0,075).',
            amountOverage:
              'Appliqué seulement aux unités au-delà de la limite. Saisissez le montant dans l’unité de la devise (par exemple 0,075).',
            isDefault:
              'Le prix que le catalogue et l’aperçu de facture utilisent pour cette période de facturation. Une période n’en a qu’un.',
          },
          Placeholders: {
            amount: '0,00',
            currency: 'Choisir une devise',
            currencySearch: 'Rechercher une devise',
            label: 'Pro, mensuel',
          },
          Meter: {
            none: 'Cette version n’accorde aucun droit qu’un prix puisse mesurer. Accordez un nombre compté ou sommé qui se remet à zéro, puis revenez.',
            stock:
              'Un stock : il ne se remet jamais à zéro, il ne peut donc pas être mesuré.',
            stockHint:
              'Un stock, comme des sièges ou du stockage, se vend comme un add-on avec une quantité, il ne se mesure pas. Les add-ons ne font pas encore partie de cette console.',
            overageUnreachable:
              'Le dépassement ne peut pas survenir sur cet octroi : sa limite est dure ou illimitée.',
          },
          livePreview: 'Se lit {{price}}',
          Errors: {
            label: 'Le libellé fait 200 caractères au plus.',
            currency: 'Choisissez une devise prise en charge par Kaiten.',
            amount:
              'Saisissez un montant valide : zéro ou plus, avec au plus 12 décimales au-delà de celles de la devise et 12 chiffres dans sa plus petite unité.',
            meter: 'Choisissez le droit que ce prix mesure.',
            period: 'Choisissez la période de facturation.',
          },
        },
        Deprecate: {
          title: 'Déprécier « {{label}} » ?',
          descriptionFlat:
            'Les abonnements déjà épinglés à ce prix continuent d’être facturés à partir de lui. Il n’est plus proposé aux nouvelles souscriptions, ni comme cible d’un changement de plan. Cette action est irréversible.',
          descriptionMetered:
            'Ce prix ne produit plus de ligne à partir de la prochaine facture, et il n’est plus proposé. Ce qu’il a déjà facturé ne change pas. Cette action est irréversible.',
          defaultNote:
            'C’est le prix par défaut de sa période : le déprécier retire l’indicateur par défaut dans la même écriture.',
          confirm: 'Déprécier',
        },
        Toasts: {
          created: 'Prix créé',
          updated: 'Prix mis à jour',
          deprecated: 'Prix déprécié',
        },
        Preview: {
          open: 'Aperçu de facture',
          unavailable:
            'Ajoutez d’abord un forfait actif : une facture part toujours d’un forfait.',
          title: 'Aperçu d’une facture',
          description:
            'Ce que facturerait, à son prochain renouvellement, un abonnement à {{name}}, version {{version}}. Rien n’est créé.',
          hint: 'Lancez l’aperçu pour voir la facture.',
          run: 'Lancer l’aperçu',
          Labels: {
            base: 'Prix de base',
            samples: 'Usage simulé',
          },
          Descriptions: {
            base: 'Le forfait dont part la facture.',
            samples:
              'Ce que chaque droit a consommé sur la période qui se termine, dans ses propres unités. Laissez un champ vide pour aucun usage.',
          },
          Placeholders: {
            quantity: '0',
          },
          Errors: {
            quantity:
              'Saisissez une quantité : zéro ou plus, avec un point pour les décimales.',
          },
        },
        Table: {
          Columns: {
            price: 'Prix',
            shape: 'Forme',
            meter: 'Mesure',
            amount: 'Montant',
            billed: 'Facturation',
            status: 'Statut',
          },
          empty: 'Cette version n’a pas encore de prix.',
        },
      },
      Table: {
        Columns: {
          name: 'Nom',
          version: 'Version',
          isActive: 'Actif',
          description: 'Description',
          type: 'Type',
          features: 'Fonctionnalités',
        },
        warningDelete:
          "Certaines instances sont toujours associées à cette licence.\nVous devez d'abord mettre à jour leur licence pour vous assurer qu'aucune instance reste liée à la licence actuelle.",
      },
      Mutation: {
        titleNew: 'Nouvelle Licence',
        titleUpdate: 'Modifier la Licence',
        Form: {
          mainTitle: 'Informations principales',
          mainDescription:
            'Nom, type, nom de version. Ajoutez ensuite les droits ci-dessous.',
          Labels: {
            name: 'Nom',
            description: 'Description',
            type: 'Type',
            versionName: 'Nom de la version',
            slug: 'Slug',
            features: 'Fonctionnalités',
            createAsDraft: 'Enregistrer comme brouillon',
          },
          Types: {
            Trial: 'Essai',
            Development: 'Développement',
            Paid: 'Payante',
            Community: 'Communauté',
          },
          Placeholders: {
            name: 'Bronze',
            description: 'Fonctionnalités limitées',
            type: 'Sélectionner un type de licence',
            versionName: 'Nom de la version',
            slug: 'bronze-license',
          },
          Descriptions: {
            features: 'Fonctionnalités disponibles dans cette licence',
            slug: 'Généré automatiquement — modifiable.',
            createAsDraft:
              "Un brouillon n'est pas encore en vente : il ne peut pas devenir la version par défaut, et la licence ne le sert pas tant que vous ne l'avez pas publié. Vous pouvez tout de même l'attribuer à une instance pour l'essayer.",
          },
          Errors: {
            name: 'Le nom est requis',
            savedAsDraft:
              'Enregistrée comme brouillon, sans être publiée : {{reason}}',
          },
          createSuccess: 'Licence créée avec succès',
          updateSuccess: 'Licence mise à jour avec succès',
          createButton: 'Créer la Licence',
          updateButton: 'Mettre à jour la Licence',
        },
      },
      Version: {
        titleNew: 'Nouvelle Version',
        titleNewOf: 'Nouvelle version de {{name}}',
        description: 'Créer une nouvelle version de cette licence',
        createButton: 'Créer la Version',
        newVersionButton: 'Nouvelle Version',
        Form: {
          description:
            'Sélectionnez un nom de licence, puis la version existante à utiliser comme base. Le type est hérité de la licence de base.',
          baseLicense: 'Licence de Base',
          selectLicense:
            'Sélectionner un nom de licence pour créer une version',
          Labels: {
            licenseName: 'Nom de la licence',
            versionName: 'Nom de version',
            baseVersion: 'Version de base (existante)',
            copyPrices: 'Copier les prix de la version de base',
          },
          Descriptions: {
            copyPrices:
              "Chaque prix actif de la version de base est ajouté à la nouvelle, dans le même ordre, une fois ses droits en place. Les abonnements restent sur leur version tant que chacun n'est pas programmé vers la nouvelle.",
          },
          Placeholders: {
            selectLicenseName: 'Sélectionner un nom de licence',
            selectBaseVersion: 'Sélectionner une version de base',
            versionName: 'ex. Dev',
          },
          entitlementsDescription:
            'Droits attachés à cette licence, leur seuil (limite) et leur tolérance de dépassement. Pour le type NUMBER, le seuil est la valeur max; utilisez Illimité ou laissez vide pour ne pas fixer de plafond. La tolérance de dépassement est le pourcentage au-delà du seuil accepté avant de rejeter la consommation : 0 en fait une limite stricte. Quand vous changez la version de base, les droits sont préremplis depuis cette version. Utilisez Réinitialiser pour les vider.',
          Errors: {
            baseLicenseRequired: 'La licence de base est requise',
            licenseNameRequired: 'Le nom de la licence est requis',
            versionNameRequired: 'Le nom de version est requis',
            baseLicenseNotFound: 'Licence sélectionnée introuvable',
          },
          typeInherited:
            'Le type est hérité de la licence de base et ne peut pas être modifié',
        },
      },
      List: {
        licenseName: 'Nom de la licence',
        unknownVersion: 'Version inconnue',
        versionName: 'Nom de version',
        versionCount: '{{count}} version',
        versionCount_other: '{{count}} versions',
        defaultBadge: 'Par défaut : {{version}}',
      },
      Lifecycle: {
        DRAFT: 'Brouillon',
        PUBLISHED: 'Publiée',
        ARCHIVED: 'Archivée',
      },
      LifecycleActions: {
        publish: {
          label: 'Publier',
          title: 'Publier {{name}} v{{version}} ?',
          description:
            'La version est mise en vente et peut devenir la version par défaut. Une licence sans version par défaut sert sa version publiée la plus récente, qui peut être celle-ci.',
          confirm: 'Publier',
          success: 'Version publiée',
          Billing: {
            prices:
              'Ses prix deviennent immuables : ils ne pourront plus qu’être dépréciés.',
            grants:
              'Ses droits sont gelés dès qu’un abonnement facture cette version.',
            others:
              'Les abonnements des autres versions ne sont pas touchés, et rien n’est archivé.',
          },
        },
        archive: {
          label: 'Archiver',
          title: 'Archiver {{name}} v{{version}} ?',
          description:
            "La version est retirée de la vente : la licence ne la sert plus et elle ne peut plus être attribuée à une instance. Les instances qui l'utilisent déjà la conservent. Vous pourrez la désarchiver plus tard.",
          confirm: 'Archiver',
          success: 'Version archivée',
        },
        unarchive: {
          label: 'Désarchiver',
          title: 'Désarchiver {{name}} v{{version}} ?',
          description:
            'La version est remise en vente : elle peut de nouveau être attribuée à des instances et devenir la version par défaut. Une licence sans version par défaut sert sa version publiée la plus récente, qui peut être celle-ci.',
          confirm: 'Désarchiver',
          success: 'Version désarchivée',
        },
        archiveDefaultUnavailable:
          "La version par défaut ne peut pas être archivée. Définissez d'abord une autre version par défaut, ou retirez le défaut.",
      },
      DefaultActions: {
        unset: 'Retirer le défaut',
        setSuccess: 'Version par défaut mise à jour',
        unsetSuccess: 'Version par défaut retirée',
      },
      DeleteDraft: {
        label: 'Supprimer',
        title: 'Supprimer le brouillon {{name}} v{{version}} ?',
        description:
          "Le brouillon et les droits qu'il accorde sont supprimés. Il n'a jamais été en vente : aucun client ne le perd. Une instance qui l'utilise encore empêche la suppression.",
        descriptionBilling:
          "Le brouillon, ses prix et les droits qu'il accorde sont supprimés. Il n'a jamais été en vente : aucun client ne le perd. Une instance qui l'utilise encore empêche la suppression.",
        confirm: 'Supprimer',
        success: 'Brouillon supprimé',
      },
      VersionsTable: {
        Columns: {
          versionName: 'Nom de version',
          version: 'Version',
          type: 'Type',
          lifecycleState: 'État',
          pricingType: 'Tarification',
          default: 'Par défaut',
          instances: 'Instances',
          actions: 'Actions',
        },
        default: 'Par défaut',
        setAsDefault: 'Définir par défaut',
        setDefaultUnavailable:
          'Seule une version publiée peut devenir la version par défaut',
      },
      Detail: {
        Tabs: {
          overview: 'Vue d’ensemble',
        },
        cardTitle: 'Détails de la licence',
        cardDescription:
          'Nom, type, version. Les droits et limites sont gérés ci-dessous.',
        defaultBadge: 'Version par défaut',
        setDefaultButton: 'Définir comme version par défaut',
        setDefaultUnavailable:
          'Seule une version publiée peut devenir la version par défaut',
        Fields: {
          name: 'Nom',
          type: 'Type',
          lifecycleState: 'État',
          version: 'Version',
          description: 'Description',
        },
        Toasts: {
          addEntitlementSuccess: 'Droit ajouté avec succès',
          addEntitlementError: "Erreur lors de l'ajout du droit",
          updateEntitlementSuccess: 'Limite du droit mise à jour avec succès',
          updateEntitlementError:
            'Erreur lors de la mise à jour de la limite du droit',
          removeEntitlementSuccess: 'Droit supprimé avec succès',
          removeEntitlementError: 'Erreur lors de la suppression du droit',
        },
      },
      Entitlements: {
        cardTitle: 'Droits & limites',
        cardDescription:
          'Droits attachés à cette licence, leur seuil (limite) et leur tolérance de dépassement. Pour le type NUMBER, le seuil est la valeur maximale ; utilisez Illimité ou laissez vide pour aucune limite. La tolérance de dépassement est le pourcentage au-delà du seuil accepté avant de rejeter la consommation : 0 en fait une limite stricte.',
        emptyMessage:
          'Aucun droit attaché. Cliquez sur « Ajouter un droit » pour en ajouter un.',
        addButton: 'Ajouter un droit',
        resetButton: 'Réinitialiser',
        removeAction: 'Retirer',
        removeAriaLabel: 'Retirer {{name}}',
        confirmRemoveTitle: 'Retirer {{name}} de cette licence ?',
        confirmRemoveDescription:
          'Les instances de cette licence perdent ce droit jusqu’à ce qu’il soit rajouté.',
        Columns: {
          entitlement: 'Droit',
          type: 'Type',
          threshold: 'Seuil / limite',
          overagePercent: 'Tolérance de dépassement',
          actions: 'Actions',
        },
        Dialog: {
          title: 'Ajouter un droit',
          description: 'Attacher un nouveau droit à cette licence.',
          entitlementLabel: 'Droit',
          entitlementPlaceholder: 'Sélectionner un droit',
          thresholdLabel: 'Seuil / limite',
          thresholdPlaceholder: 'ex. 1000',
          overagePercentLabel: 'Tolérance de dépassement (%)',
          overagePercentPlaceholder: 'ex. 10',
          maximumAllowedUsage:
            "La consommation est acceptée jusqu'à {{max}} avant d'être rejetée.",
          overagePercentDescription:
            'Pourcentage au-delà du seuil accepté avant de rejeter la consommation, de 0 à 100. Zéro est une limite stricte.',
          booleanLabel: 'Valeur',
          booleanEnabled: 'Activé',
          booleanDisabled: 'Désactivé',
          configLabel: 'Configuration (JSON)',
          cancelButton: 'Annuler',
          addButton: 'Ajouter',
        },
        saveButton: 'Enregistrer',
        cancelButton: 'Annuler',
        thresholdPlaceholder: 'ex. 1000 ou Illimité',
        inlineEditHint: 'Entrée pour enregistrer · Échap pour annuler',
        overageNeedsLimit:
          "Définissez d'abord une limite : un droit illimité n'a rien à dépasser.",
        allAttachedHint:
          'Tous les droits du catalogue sont déjà attachés à cette licence.',
        thresholdError: 'Le seuil doit être un entier ou Illimité',
        configError: 'La configuration doit être un JSON valide',
        overagePercentPlaceholder: 'ex. 10',
        overagePercentError:
          'La tolérance de dépassement doit être un pourcentage entier supérieur ou égal à 0',
        Status: {
          enabled: 'Activé',
          disabled: 'Désactivé',
          unlimited: 'Illimité',
          configured: 'Configuré',
          hardLimit: 'Limite stricte',
          softLimit: '+{{percent}} % de dépassement',
        },
      },
    },
    Releases: {
      title: 'Releases',
      titleManagement: 'Gestion des releases',
      subtitle:
        'Gérez les releases, components, zones de déploiement et déploiements sur tous les environnements',
      tabs: {
        releases: 'Releases',
        components: 'Components',
        deploymentZones: 'Zones de déploiement',
        deployments: 'Déploiements',
      },
      Form: {
        createRelease: 'Créer une release',
        createZone: 'Créer une zone de déploiement',
      },
      Releases: {
        title: 'Releases',
        subtitle:
          'Parcourez la vue historique complète des releases, components, zones et instances liées',
        Table: {
          Columns: {
            components: 'Components',
            instances: 'Instances',
          },
          empty: 'Aucune release pour l’instant. Créez-en une pour commencer.',
          componentCount_one: '{{count}} component',
          componentCount_other: '{{count}} components',
          instanceCount_one: '{{count}} instance',
          instanceCount_other: '{{count}} instances',
          zoneCount_one: '{{count}} zone',
          zoneCount_other: '{{count}} zones',
        },
        Dialogs: {
          componentsTitle: 'Components de cette release',
          componentsDescription:
            'Components versionnés inclus dans ce snapshot de release.',
          instancesTitle: 'Instances liées à cette release',
          instancesDescription:
            'Instances actuelles exécutées dans des zones où cette release a déjà été déployée.',
          Columns: {
            customer: 'Customer',
            deploymentZone: 'Zone de déploiement',
            instance: 'Instance',
          },
        },
      },
      Detail: {
        actions: {
          deploy: 'Déployer',
        },
        fallback: {
          noDescription: 'Aucune description fournie.',
        },
        links: {
          openDeploymentZone: 'Ouvrir la zone de déploiement',
        },
        stats: {
          deploymentZones: 'Zones de déploiement',
          productionZones: 'Zones de production',
          lastDeployment: 'Dernier déploiement',
          never: 'Jamais',
        },
        tabs: {
          overview: 'Vue d’ensemble',
          deploymentZones: 'Zones de déploiement',
        },
        Overview: {
          general: {
            title: 'Informations générales',
            description:
              'Métadonnées de la release et historique d’audit immuable.',
            fields: {
              version: 'Version',
              slug: 'Slug',
              id: 'ID',
              status: 'Statut',
              description: 'Description',
            },
            audit: {
              createdAt: 'Créée le',
              by: 'par',
            },
          },
          deployment: {
            title: 'Couverture de déploiement',
            description:
              'Couverture par type de zone, avec un accès direct aux zones liées.',
            fields: {
              totalZones: 'Zones liées',
            },
            empty:
              'Aucune zone de déploiement n’est encore liée à cette release.',
          },
          components: {
            title: 'Components',
            description: 'Ce que cette release embarque, figé à sa création.',
            columns: {
              name: 'Nom',
              version: 'Version',
              description: 'Description',
            },
            empty: 'Cette release ne contient aucun component.',
          },
        },
        DeploymentZones: {
          title: 'Zones de déploiement liées',
          description:
            'Zones actuellement liées à cette release par un déploiement actif.',
          emptyTitle: 'Déployée nulle part pour l’instant',
          emptyDescription:
            'Choisissez une zone de déploiement où exécuter cette release.',
          emptyCta: 'Déployer sur une zone',
        },
      },
      Deployments: {
        title: 'Déploiements',
        subtitle:
          'Pilotez les releases courantes sur les zones de déploiement et préparez la prochaine version',
        Form: {
          title: 'Créer une release',
          description:
            'Créez une nouvelle release depuis zéro ou à partir d’une release existante, puis sélectionnez, créez et mettez à jour les components qu’elle doit contenir.',
          Steps: {
            base: 'Base de release',
            metadata: 'Informations',
            components: 'Components',
          },
          Buttons: {
            next: 'Suivant',
            back: 'Retour',
          },
          steps: {
            base: {
              title: 'Choisir une base de release',
              description:
                'Partez de zéro ou héritez des components d’une release existante avant de préparer la nouvelle version.',
            },
            metadata: {
              title: 'Release Informations',
              description:
                'Définissez la version et la description de cette release.',
            },
            inherited: {
              title: 'Components hérités',
              description:
                'Passez en revue les components copiés depuis la release de base et modifiez ou supprimez ceux qui changent dans cette version.',
            },
            select: {
              title: 'Sélectionner des components existants',
              description:
                'Ajoutez à cette release des components déjà présents dans le catalogue partagé.',
            },
            add: {
              title: 'Créer des components',
              description:
                'Créez les nouveaux components qui apparaissent pour la première fois dans cette release.',
            },
          },
          modes: {
            scratch: {
              title: 'Partir de zéro',
              description:
                'Créez une release sans component hérité. Vous pourrez ensuite sélectionner des components existants ou en créer de nouveaux.',
            },
            existing: {
              title: 'Utiliser une release existante',
              description:
                'Partez d’une release précédente, révisez les components hérités, ajoutez des components déjà présents dans le catalogue et créez-en de nouveaux si besoin.',
            },
          },
          previousRelease: 'Release précédente',
          selectPreviousRelease: 'Sélectionner une release de base',
          clearPreviousRelease: 'Effacer la release de base',
          changeBaseDialog: {
            title: 'Réinitialiser les changements de components ?',
            description:
              'Changer la release de base supprimera les sélections, les modifications en cours sur les components ainsi que les nouveaux components ajoutés. Les métadonnées de la release seront conservées.',
            confirm: 'Réinitialiser les changements',
          },
          inheritedComponentsTitle: 'Components hérités',
          inheritedComponentsDescription:
            'Components copiés depuis {{version}}.',
          noPreviousReleaseSelected:
            'Choisissez une release précédente pour hériter de ses components, ou partez d’une release vide.',
          noInheritedComponents:
            'Cette release de base ne contient encore aucun component.',
          selectComponentsTitle: 'Components disponibles',
          selectComponentsDescription:
            'Choisissez les components existants du catalogue partagé à inclure dans cette release.',
          selectedComponentsCount_one: '{{count}} sélectionné',
          selectedComponentsCount_other: '{{count}} sélectionnés',
          noAvailableComponents:
            'Aucun component standalone n’est encore disponible. Créez-en un à l’étape suivante si besoin.',
          noMatchingComponents:
            'Aucun component ne correspond à cette recherche.',
          searchComponentsPlaceholder: 'Rechercher des components...',
          editComponent: 'Modifier',
          deleteComponent: 'Supprimer',
          revertComponent: 'Annuler',
          componentRemoved:
            'Ce component sera supprimé de la nouvelle release.',
          addComponentsTitle: 'Nouveaux components',
          addComponentsDescription:
            'Créez les components qui apparaissent pour la première fois dans cette release.',
          addComponentDescription:
            'Définissez les métadonnées d’un component créé depuis ce wizard de release.',
          addComponent: 'Ajouter un component',
          noAddedComponents:
            'Aucun nouveau component pour le moment. Ajoutez-en un si cette release doit créer un nouveau component.',
          newComponentLabel: 'Nouveau component {{index}}',
          statuses: {
            edited: 'Modifié',
            removed: 'Supprimé',
          },
          componentPatchesTitle: 'Patches de components',
          componentPatchesDescription:
            'Ajoutez, mettez à jour ou retirez des components par-dessus la release héritée.',
          componentPatchesAddOnly:
            'Sans release précédente, seuls les patches d’ajout sont disponibles.',
          addPatch: 'Ajouter un patch',
          noComponentPatches:
            'Aucun patch de component pour le moment. Ajoutez-en un si cette release fait évoluer le catalogue.',
          patchLabel: 'Patch {{index}}',
          operation: 'Opération',
          component: 'Component',
          selectComponent: 'Sélectionner un component',
          componentSlug: 'Slug du component',
          componentNamePlaceholder: 'API Gateway',
          operations: {
            add: 'Ajouter un component',
            update: 'Mettre à jour un component',
            remove: 'Retirer un component',
          },
          basedOn: 'Basé sur {{version}}',
          Columns: {
            name: 'Nom',
            version: 'Version',
            source: 'Source',
            actions: 'Actions',
          },
          sources: {
            new: 'Nouveau',
            catalog: 'Catalogue',
            inherited: 'Hérité',
          },
          componentsCard: {
            title: 'Components',
            description: 'Gérez les components inclus dans cette release.',
            addFromCatalog: 'Ajouter depuis le catalogue',
            createNew: 'Créer un nouveau',
            emptyMessage:
              'Aucun component pour le moment. Ajoutez depuis le catalogue ou créez-en un nouveau.',
            missingSlug:
              'Ce component n’a pas encore de slug ; actualisez le catalogue ou recréez-le.',
          },
          addCatalogDialog: {
            title: 'Ajouter des components du catalogue',
            description:
              'Sélectionnez des components existants à inclure dans cette release.',
            addButton_one: 'Ajouter {{count}} component',
            addButton_other: 'Ajouter {{count}} components',
          },
          createComponentDialog: {
            title: 'Créer un nouveau component',
            description:
              'Définissez un component qui sera créé avec cette release.',
            namePlaceholder: 'API Gateway',
            createButton: 'Créer le component',
          },
        },
      },
      Components: {
        title: 'Components',
        subtitle:
          'Parcourez et créez des components versionnés sur votre plateforme, y compris ceux liés aux releases',
        Actions: {
          create: 'Créer un component',
        },
        Stats: {
          totalComponents: 'Total des components',
          releasesUsingComponents: 'Releases avec components',
          sharedAcrossReleases: 'Partagés entre releases',
          versionedComponents: 'Components versionnés',
        },
        Form: {
          titleCreate: 'Créer un component',
          titleEdit: 'Modifier le component',
          Labels: {
            name: 'Nom',
            version: 'Version',
            slug: 'Slug',
            description: 'Description',
          },
          Placeholders: {
            name: 'API Gateway',
            version: 'v1.2.3',
            slug: 'api-gateway',
            description:
              'Route le trafic tenant vers les API REST et GraphQL publiques',
          },
          Descriptions: {
            name: 'Nom lisible du component.',
            version:
              'Version affichée dans le catalogue et les flux de release.',
            slug: 'Généré automatiquement — modifiable.',
            description: 'Contexte optionnel affiché dans le catalogue.',
          },
          Errors: {
            nameRequired: 'Le nom est requis',
            versionRequired: 'La version est requise',
          },
        },
        Table: {
          Columns: {
            name: 'Nom',
            version: 'Version',
            releases: 'Releases',
            createdAt: 'Créé',
            createdBy: 'Créé par',
          },
          releaseCount_one: '{{count}} release',
          releaseCount_other: '{{count}} releases',
          versionCount_one: '{{count}} version',
          versionCount_other: '{{count}} versions',
          versionsOf: 'Versions de {{name}}',
          empty: "Aucun component pour l'instant. Créez-en un pour commencer.",
        },
        Dialog: {
          title: 'Releases pour {{name}}',
          description: 'Liste de toutes les releases qui incluent ce component',
          Columns: {
            release: 'Release',
            status: 'Statut',
            created: 'Créé',
          },
        },
        fallback: {},
        Success: {
          created: 'Component créé avec succès',
          updated: 'Component mis à jour avec succès',
        },
      },
      DeploymentZones: {
        title: 'Zones de déploiement',
        subtitle:
          'Gérez les environnements dans lesquels les releases sont préproduites et déployées',
        Table: {
          releaseCount_one: '{{count}} release',
          releaseCount_other: '{{count}} releases',
          instanceCount_one: '{{count}} instance',
          instanceCount_other: '{{count}} instances',
        },
        Dialogs: {
          releasesTitle: 'Historique des releases de cette zone',
          releasesDescription:
            'Releases déjà déployées dans cette zone de déploiement.',
          instancesTitle: 'Instances de cette zone',
          instancesDescription:
            'Instances actuellement liées à cette zone de déploiement.',
        },
        Detail: {
          fallback: {
            noDescription: 'Aucune description fournie.',
          },
          links: {
            openZone: 'Ouvrir la zone',
          },
          stats: {
            type: 'Type',
            currentRelease: 'Release courante',
            metadataKeys: 'Clés de métadonnées',
            sharedReleaseZones: 'Zones sur la même release',
          },
          status: {
            deployed: 'Déployée',
            notDeployed: 'Non déployée',
          },
          tabs: {
            overview: 'Vue d’ensemble',
            peers: 'Zones sœurs',
          },
          Overview: {
            general: {
              title: 'Informations générales',
              description:
                'Identité de la zone de déploiement et historique d’audit immuable.',
              fields: {
                slug: 'Slug',
                id: 'ID',
              },
              audit: {
                createdAt: 'Créée le',
                updatedAt: 'Mise à jour le',
                by: 'par',
              },
            },
            release: {
              title: 'Release courante',
              description:
                'Release actuellement associée à cette zone de déploiement.',
            },
            features: {
              title: 'Métadonnées de features',
              empty:
                'Aucune métadonnée de features configurée pour cette zone.',
            },
          },
          Peers: {
            title: 'Zones sœurs',
            description:
              'Les autres zones de déploiement qui exécutent actuellement la même release.',
            empty: 'Aucune autre zone de déploiement n’exécute cette release.',
            notDeployedTitle: 'Aucune zone sœur',
            notDeployedDescription:
              'Aucune release n’est encore liée à cette zone : impossible de déterminer ses zones sœurs.',
          },
        },
      },
    },
    EntitlementGroups: {
      Mutation: {
        titleNew: 'Nouveau groupe de droits',
        Form: {
          inlineDescription:
            'Créez un nouveau groupe et associez-le immédiatement à ce droit.',
          Labels: {
            name: 'Nom',
            description: 'Description',
          },
          Placeholders: {
            name: 'Quotas d’usage',
            description: 'Description optionnelle',
          },
          Descriptions: {
            name: 'Le libellé affiché dans les filtres de droits',
            description: 'Contexte optionnel pour les administrateurs',
          },
          createButton: 'Créer le groupe',
          updateButton: 'Mettre à jour le groupe',
        },
      },
    },
    Entitlements: {
      title: 'Droits',
      subtitle: 'Fonctionnalités et limites accordées par vos licences',
      Table: {
        Columns: {
          name: 'Nom',
          description: 'Description',
          groups: 'Groupes',
          type: 'Type',
          aggregationMethod: "Méthode d'agrégation",
        },
      },
      Delete: {
        checkingLicenses: 'Vérification des licences qui accordent ce droit…',
        grantedByLicenses_one:
          'Ce droit est accordé par {{count}} licence. Retirez-le de cette licence avant de le supprimer.',
        grantedByLicenses_other:
          'Ce droit est accordé par {{count}} licences. Retirez-le de ces licences avant de le supprimer.',
      },
      Mutation: {
        titleNew: 'Nouveau Droit',
        titleUpdate: 'Modifier le Droit',
        deleteSuccess: 'Droit supprimé avec succès',
        Form: {
          mainTitle: 'Informations principales',
          Labels: {
            name: 'Nom',
            description: 'Description',
            groups: 'Groupes',
            type: 'Type',
            aggregationMethod: "Méthode d'agrégation",
            icon: 'Icône',
            userFacing: 'Visible côté client',
            displayOrder: "Ordre d'affichage",
            units: 'Unités',
            unitSingular: 'Unité (singulier)',
            unitPlural: 'Unité (pluriel)',
            saleUnitsToggle:
              'La fonctionnalité est vendue dans une unité différente',
            saleUnitSingular: 'Unité de vente (singulier)',
            saleUnitPlural: 'Unité de vente (pluriel)',
            saleUnitFactor: 'Calcul',
            saleUnitFactorOne: 'Une unité de vente',
            saleUnitFactorValue: 'Unités de base par unité de vente',
            resetPeriod: "Remise à zéro de l'usage",
            resetAnchor: 'Fenêtre alignée sur',
          },
          Placeholders: {
            name: 'Nom du droit',
            description: 'Description du droit',
            groups: 'Rechercher ou créer des groupes',
            groupSearch: 'Rechercher des groupes',
            type: 'Sélectionner un type',
            aggregationMethod: "Sélectionner une méthode d'agrégation",
            displayOrder: '0',
            unitSingular: 'siège',
            unitPlural: 'sièges',
            saleUnitSingular: 'pack',
            saleUnitPlural: 'packs',
            saleUnitFactor: '3',
            resetPeriod: 'Choisir une cadence de remise à zéro',
            resetAnchor: 'Choisir un alignement de fenêtre',
          },
          Descriptions: {
            name: 'Le nom du droit',
            description: 'Une description détaillée de ce que ce droit fournit',
            groups:
              'Associez ce droit à un ou plusieurs groupes pour le filtrage et le reporting.',
            type: 'Le type de droit (Booléen ou Nombre)',
            aggregationMethod:
              "Comment plusieurs événements d'utilisation sont combinés",
            icon: 'Choisissez une icône pour représenter ce droit',
            userFacing:
              'Affiche ce droit dans les composants destinés aux clients (pages de plans et tarifs)',
            displayOrder:
              'Ordre de tri dans les composants destinés aux clients (les valeurs les plus basses apparaissent en premier)',
            resetPeriod:
              "À quelle fréquence le compteur d'usage repart de zéro. Un compteur à vie ne se réinitialise jamais, et la cadence ne peut être posée qu'une seule fois.",
            resetPeriodLocked:
              "La cadence est figée une fois posée : l'usage déjà stocké deviendrait ininterprétable si elle changeait.",
            resetAnchor:
              'Les fenêtres calendaires commencent sur les frontières du calendrier UTC. Les fenêtres « début de licence » sont calées sur la date de début de licence propre à chaque instance.',
            resetPeriodLatest:
              "L'agrégation « Dernier » ne conserve que la valeur la plus récente : elle ne peut pas être combinée à une remise à zéro périodique.",
          },
          Icon: {
            trigger: 'Choisir une icône',
            search: 'Rechercher des icônes…',
            empty: 'Aucune icône trouvée',
            clear: "Retirer l'icône",
          },
          Actions: {
            createGroup: 'Créer "{{name}}"',
            creatingGroup: 'Création de "{{name}}"',
            removeGroup: 'Retirer le groupe {{name}}',
          },
          Empty: {
            noGroupsSelected: 'Aucun groupe sélectionné',
            noGroupResults: 'Aucun groupe correspondant',
          },
          Units: {
            fallbackSingular: 'unité',
            fallbackPlural: 'unités',
          },
          Errors: {
            name: 'Le nom est requis',
            unitPair: "Renseignez le singulier et le pluriel de l'unité",
            saleUnitTrio:
              "Renseignez les libellés de l'unité de vente et le facteur de conversion ensemble",
            saleUnitRequiresBase:
              "Les unités de vente nécessitent les libellés de l'unité de base",
            saleUnitFactor: 'Le facteur de conversion doit être supérieur à 0',
            unitLabelTooLong:
              "Les libellés d'unité sont limités à 100 caractères",
          },
          Steps: {
            identity: 'Informations du droit',
            type: 'Configuration du type',
          },
          createButton: 'Créer le Droit',
          updateButton: 'Mettre à jour le Droit',
          createSuccess: 'Droit créé avec succès',
          updateSuccess: 'Droit mis à jour avec succès',
        },
      },
      Detail: {
        active: 'Actif',
        editName: 'Modifier le nom',
        loading: 'Chargement...',
        stats: {
          linkedLicenses: {
            label: 'Licences liées',
            helper: 'Licences contenant ce droit',
          },
          licenseAlerts: {
            label: 'Alertes de licence',
            near: 'Proches de la limite',
            over: 'Au-delà de la limite',
            ratio: '{{percent}} % des licences liées',
          },
          unlimitedMappings: {
            label: 'Associations illimitées',
            helper: 'Licences liées sans limite',
          },
          impactScope: {
            label: "Périmètre d'impact",
            customers_one: 'client impacté',
            customers_other: 'clients impactés',
            atRisk_one: 'instance à risque',
            atRisk_other: 'instances à risque',
          },
        },
        Customers: {
          coverageTable: {
            title: 'Couverture par client',
            description:
              'Impact, alertes et saturation maximale observée, client par client.',
            empty: 'Aucune donnée de couverture client pour ce droit.',
            columns: {
              customer: 'Client',
              impactedInstances: 'Instances impactées',
              near: 'Proches',
              over: 'Dépassées',
              maxUsage: 'Usage maximal',
              mostExposedLicense: 'Licence la plus exposée',
            },
          },
        },
        Usage: {
          noCaps:
            "Aucune licence liée ne plafonne ce droit : il n'y a pas encore de saturation à mesurer.",
          saturationBuckets: {
            title: 'Tranches de saturation',
            description:
              'Répartition globale de la saturation des instances pour ce droit.',
          },
          topRiskLicenses: {
            title: 'Licences les plus à risque',
            description:
              "Licences classées par ratio d'usage observé le plus élevé.",
            empty: 'Aucune licence à risque détectée.',
            instances_one: 'instance impactée',
            instances_other: 'instances impactées',
          },
          atRiskInstances: {
            title: 'Instances à risque',
            description:
              'Instances actuellement proches ou au-delà du seuil pour ce droit.',
            empty:
              "Aucune instance n'est actuellement proche ou au-delà de la limite.",
            lifetime: 'À vie',
            unlimited: 'Illimité',
            softLimitHint: '(+{{percent}} % de dépassement)',
            softLimitDescription:
              "Limite souple : l'utilisation est acceptée jusqu'à {{max}} avant d'être rejetée.",
            columns: {
              instance: 'Instance',
              customer: 'Client',
              license: 'Licence',
              usage: 'Usage',
              threshold: 'Seuil',
              currentPeriod: 'Fenêtre courante',
              saturation: 'Saturation',
              status: 'Statut',
            },
          },
        },
        buttons: {
          edit: 'Modifier',
        },
        iconDialog: {
          title: 'Choisir une icône',
          editLabel: "Modifier l'icône",
        },
        tabs: {
          overview: 'Vue d’ensemble',
          usage: 'Usage',
        },
        fallback: {
          unit: 'événements',
          noDescription: 'Aucune description fournie.',
          notAvailable: 'n/a',
        },
        Overview: {
          general: {
            title: 'Informations générales',
            description:
              'Métadonnées principales du droit alignées avec le contrat de schéma.',
            fields: {
              name: 'Nom',
              type: 'Type',
              aggregationMethod: "Méthode d'agrégation",
              resetPeriod: "Remise à zéro de l'usage",
              resetAnchor: 'Fenêtre alignée sur',
              baseUnit: 'Unité de base',
              saleUnit: 'Unité de vente',
              calculation: 'Calcul',
              userFacing: 'Visible côté client',
              groups: 'Groupes',
              description: 'Description',
            },
            values: {
              visible: 'Visible',
              hidden: 'Masqué',
            },
            unitPair: '{{singular}} / {{plural}}',
            calculationFormula: '1 {{saleUnit}} = {{factor}} {{baseUnit}}',
            audit: {
              createdAt: 'Créé le',
              updatedAt: 'Dernière mise à jour',
              by: 'par',
            },
          },
          licenses: {
            title: 'Licences liées',
            description: 'Ce que chaque licence accorde pour ce droit.',
            empty: "Aucune licence n'accorde encore ce droit.",
            instances_one: 'instance',
            instances_other: 'instances',
            more_one: 'Afficher {{count}} autre licence',
            more_other: 'Afficher {{count}} autres licences',
          },
          contract: {
            title: 'Contrat de calcul',
            description:
              "Comment les événements d'ingestion sont transformés en usage de droit.",
            fields: {
              eventKey: 'Clé événement',
              unit: 'Unité',
              aggregationMethod: 'Agrégation',
            },
            formula: {
              title: 'Formule',
            },
          },
          payload: {
            title: 'Aperçu du payload API',
            description:
              'Capture des champs de schéma utilisés par les endpoints create/update.',
          },
        },
      },
      EntitlementTypes: {
        BOOLEAN: 'Booléen',
        NUMBER: 'Nombre',
        CONFIG: 'Config',
        NUMBER_AI_CREDIT: 'Crédit IA',
      },
      AggregationMethods: {
        COUNT: 'Comptage',
        SUM: 'Somme',
        AVERAGE: 'Moyenne',
        MIN: 'Minimum',
        MAX: 'Maximum',
        LATEST: 'Dernier',
      },
      ResetPeriods: {
        NONE: 'Jamais (à vie)',
        HOUR: 'Toutes les heures',
        DAY: 'Tous les jours',
        WEEK: 'Toutes les semaines',
        MONTH: 'Tous les mois',
        YEAR: 'Tous les ans',
      },
      ResetAnchors: {
        CALENDAR: 'Calendrier',
        LICENSE_START: 'Date de début de licence',
      },
    },
    FeatureFlags: {
      title: 'Feature Flags',
      subtitle:
        'Bascules dynamiques pour la configuration en temps réel et le déploiement progressif',
      Stats: {
        totalFlags: 'Total',
        enabled: 'Activés',
        disabled: 'Désactivés',
        withTargeting: 'Avec ciblage',
      },
      Table: {
        Columns: {
          name: 'Nom',
          description: 'Description',
          type: 'Type',
          enabled: 'Activé',
          variants: 'Variantes',
          targetings: 'Règles de ciblage',
          metadata: 'Métadonnées',
        },
        Dialogs: {
          metadataTitle: 'Métadonnées du feature flag',
          metadataDescription:
            "Métadonnées opérationnelles utilisées par l'évaluation et les outils de pilotage.",
          metadataTrigger: 'Ouvrir les métadonnées du feature flag',
        },
      },
      Detail: {
        enabled: 'Activé',
        disabled: 'Désactivé',
        editName: 'Modifier le nom',
        buttons: {
          tryIt: 'Tester',
          configure: 'Configurer',
        },
        badges: {
          event: 'event: {{eventName}}',
        },
        fallback: {
          noDescription: 'Aucune description fournie.',
          notAvailable: 'n/a',
          unknownVariant: 'variante inconnue',
        },
        defaultVariantTypes: {
          basic: 'Variante simple',
          rolloutDate: 'Déploiement par date',
          rolloutPercentage: 'Déploiement par pourcentage',
        },
        stats: {
          variants: {
            label: 'Variantes',
            helper: 'Variantes configurées',
          },
          targetingRules: {
            label: 'Règles de ciblage',
            helper: '{{count}} règles de rollout',
          },
          evaluations: {
            label: 'Évaluations (session)',
            helper: 'Capturées via Tester',
          },
          defaultStrategy: {
            label: 'Stratégie par défaut',
            helperDistribution: '{{count}}% de distribution totale',
            helperSingle: 'Stratégie de fallback unique',
          },
        },
        tabs: {
          overview: 'Vue d’ensemble',
          variants: 'Variantes',
          targeting: 'Ciblage',
          evaluation: 'Historique Try it',
        },
        Overview: {
          general: {
            title: 'Informations générales',
            description:
              'Identité principale et métadonnées de propriété du flag.',
            fields: {
              type: 'Type',
              eventName: 'Nom de l’événement',
              slug: 'Slug',
              id: 'ID',
              enabled: 'Statut',
              owner: 'Propriétaire',
            },
            audit: {
              createdAt: 'Créé',
              updatedAt: 'Dernière mise à jour',
              by: 'par',
            },
          },
          defaultVariant: {
            title: 'Stratégie de variante par défaut',
            description:
              'Renvoyée quand aucune règle de ciblage ne correspond ou quand le ciblage est ignoré.',
            total: 'total: {{count}}%',
            basicValue: 'Retourne la variante {{variant}}',
            start: 'Début',
            end: 'Fin',
          },
          metadata: {
            title: 'Métadonnées',
            description:
              'Métadonnées opérationnelles utilisées par les outils de pilotage.',
            empty: 'Aucune métadonnée.',
          },
        },
        Variants: {
          definition: {
            title: 'Définition des variantes',
            description:
              'Les noms de variantes sont référencés par la stratégie par défaut et les règles de ciblage.',
            columns: {
              variant: 'Variante',
              description: 'Description',
              payloadPreview: 'Aperçu du payload',
              usedInDefault: 'Utilisée par défaut',
            },
            empty: 'Aucune variante configurée.',
          },
          defaultUsage: {
            dateBased: 'basé sur la date',
            default: 'Par défaut',
          },
        },
        Targeting: {
          rules: {
            title: 'Règles de ciblage (ordonnées)',
            description:
              'L’évaluation suit first-match-wins. Placez les règles les plus spécifiques en haut.',
            empty: 'Aucune règle de ciblage configurée.',
            index: '#{{index}}',
            returnVariant: 'Retourne la variante',
            distribution: 'Distribution par bucket de variantes',
            total: 'total: {{total}}%',
            start: 'Début',
            end: 'Fin',
          },
          fallback: {
            title: 'Étape de fallback',
            description:
              'Si aucune règle de ciblage ne correspond, résolution via la stratégie par défaut {{type}}.',
          },
        },
        Evaluation: {
          samples: {
            title: 'Historique Try it',
            description:
              'Ce que Try it a renvoyé dans cette session navigateur. Rien n’est enregistré.',
            columns: {
              context: 'Contexte',
              variant: 'Variante',
              reason: 'Raison',
              value: 'Valeur',
            },
            empty:
              'Aucune évaluation pour le moment. Lancez Tester pour remplir ce tableau.',
          },
          session: {
            title: 'Cette session',
            description:
              'Compteurs des essais Try it de cette session navigateur.',
            evaluations: 'Évaluations',
            distinctVariants: 'Variantes distinctes',
            targetingRules: 'Règles de ciblage',
            owner: 'Propriétaire: {{owner}}',
            defaultStrategy: 'Stratégie par défaut: {{type}}',
          },
          contextDialog: {
            trigger: '</>',
            title: 'Contexte d’évaluation',
            description:
              'Payload JSON brut pour l’évaluation {{evaluationId}}.',
          },
        },
      },
      Mutation: {
        titleNew: 'Nouveau Feature Flag',
        titleUpdate: 'Modifier le Feature Flag',
        Form: {
          Steps: {
            step1: 'Informations générales',
            step2: 'Configuration des variantes',
            step3: 'Variante par défaut',
            step4: 'Règles de ciblage',
          },
          Step1: {
            title: 'Informations générales',
            Labels: {
              name: 'Nom',
              description: 'Description',
              slug: 'Slug',
              type: 'Type',
              enabled: 'Activer ce feature flag',
              statusEnabled: 'Activé',
              statusDisabled: 'Désactivé',
            },
            Placeholders: {
              name: 'Accès bêta',
              description: 'Contrôle l’accès aux fonctionnalités bêta',
              slug: 'acces-beta',
              type: 'Sélectionner un type',
            },
            Descriptions: {
              name: 'Nom lisible du flag (ex. "Accès bêta")',
              description:
                'Description optionnelle de ce que contrôle ce feature flag',
              slug: 'Identifiant unique utilisé pour l’évaluation (kebab-case, généré automatiquement depuis le nom)',
              type: 'Type de donnée utilisé pour les variantes (booléen, string, nombre, objet)',
              enabled:
                'Quand il est désactivé, le feature flag retournera toujours la variante par défaut, quel que soit le ciblage',
            },
          },
          Step2: {
            title: 'Configuration des variantes',
            availableVariants: 'Variantes disponibles',
            Labels: {
              variants: 'Variantes',
              defaultVariant: 'Variante par défaut',
            },
            Placeholders: {
              variants:
                '[{"name": "on", "description": "Fonctionnalité activée", "value": true}, {"name": "off", "description": "Fonctionnalité désactivée", "value": false}]',
              defaultVariant: '"off"',
            },
            Descriptions: {
              variants:
                'Liste des valeurs autorisées. Chaque variante doit avoir un nom, une description et une valeur compatibles avec le type du flag',
              defaultVariant:
                'Nom de la variante par défaut (doit exister dans la liste) ou configuration de rollout',
            },
            noVariantsWarning:
              'Veuillez créer au moins une variante avant de sélectionner la variante par défaut.',
            Errors: {
              atLeastOneVariant: 'Au moins une variante est requise',
              allVariantsMustBeValid:
                'Toutes les variantes doivent avoir un nom et une valeur valide',
              defaultVariantRequired:
                'Veuillez sélectionner une variante par défaut dans la liste',
            },
          },
          Step3: {
            title: 'Variante par défaut',
            DefaultVariant: {
              title: 'Configuration de la variante par défaut',
              description:
                'Configurez la variante à retourner quand aucune règle de ciblage ne correspond, ou comme stratégie de rollout progressif',
              typeLabel: 'Type de variante par défaut',
              variantLabel: 'Variante par défaut',
              fallbackVariantLabel: 'Variante par défaut du codegen',
              fallbackVariantDescription:
                'Variante utilisée comme fallback par défaut dans le code généré uniquement. Elle n’est pas utilisée pour l’évaluation runtime.',
              fallbackValueLabel: 'Valeur de fallback du codegen',
              fallbackValueDescription:
                'Valeur embarquée comme fallback par défaut dans le code généré. Utilisée uniquement lors de la consommation du flag via les SDK générés. Pré-remplie à partir de la variante sélectionnée, mais modifiable.',
              Types: {
                simple: 'Variante simple',
                rolloutDate: 'Rollout progressif (par date)',
                rolloutPercentage: 'A/B test (par pourcentage)',
              },
            },
            Errors: {
              defaultVariantRequired:
                'Veuillez sélectionner une variante par défaut dans la liste',
            },
          },
          Step4: {
            title: 'Règles de ciblage',
            subtitle:
              'Définissez des conditions CEL pour une évaluation dynamique du flag',
            exampleBasicTargeting: 'Ciblage simple (règle basique)',
            exampleRolloutDate: 'Rollout par date (progressif)',
            exampleRolloutPercentage: 'Rollout par pourcentage (A/B test)',
            Labels: {
              targetings: 'Règles de ciblage',
              eventName: 'Nom de l’événement',
              metadata: 'Métadonnées',
            },
            Placeholders: {
              targetings: '[]',
              eventName: 'feature_flag_evaluated',
              metadata: '{}',
            },
            Descriptions: {
              targetings:
                'Liste de règles de ciblage basées sur CEL, évaluées à l’exécution dans l’ordre jusqu’à trouver une correspondance.',
              eventName:
                'Nom de l’événement de tracking (généré automatiquement si vide)',
              metadata:
                'Métadonnées optionnelles à des fins de documentation ou d’intégration',
            },
            Examples: {
              basic:
                '{"type": "basic", "name": "Clients Enterprise", "rule": "__kaiten.license.familySlug == \\"scale\\" && __kaiten.deploymentZone.type == \\"production\\"", "variant": "on"}',
              rolloutDate:
                '{"type": "rollout_date", "name": "Rollout progressif EU", "rule": "__kaiten.deploymentZone.type == \\"production\\"", "start": {"date": "2025-01-01T00:00:00Z", "percentage": 0, "variant": "on"}, "end": {"date": "2025-01-31T23:59:59Z", "percentage": 100, "variant": "on"}}',
              rolloutPercentage:
                '{"type": "rollout_percentage", "name": "A/B test Premium", "rule": "__kaiten.license.familySlug == \\"premium\\"", "distribution": {"on": 50, "off": 50}}',
            },
            Errors: {
              defaultVariantRequired:
                'Veuillez sélectionner une variante par défaut',
            },
          },
          Buttons: {
            next: 'Suivant',
            back: 'Retour',
            create: 'Créer le Feature Flag',
            update: 'Mettre à jour le Feature Flag',
          },
          SubmitBlockers: {
            title:
              'Vous devez encore corriger les points suivants avant de soumettre :',
            stepTitle: 'Complétez cette étape avant de continuer :',
            iconLabel: 'Pourquoi la soumission est indisponible',
            Reasons: {
              submissionInProgress: 'La soumission est déjà en cours.',
              validationInProgress: 'La validation est encore en cours.',
              noChangesCreate:
                'Remplissez le formulaire avant de créer le feature flag.',
              noChangesUpdate:
                'Modifiez au moins un champ avant de mettre à jour le feature flag.',
              nameRequired: 'Le nom est requis.',
              slugRequired: 'Le slug est requis.',
              slugInvalid:
                'Le slug doit être en kebab-case et contenir entre 2 et 100 caractères.',
              reviewForm:
                'Vérifiez les champs mis en évidence et la configuration avant de soumettre.',
            },
          },
          Dialog: {
            createSuccess: 'Feature flag créé avec succès',
            updateSuccess: 'Feature flag mis à jour avec succès',
          },
          TypeChangeDialog: {
            title: 'Confirmer le changement de type',
            description:
              'Changer le type du feature flag réinitialisera toutes les variantes et règles de ciblage. Cette action est irréversible. Voulez-vous continuer ?',
            cancel: 'Annuler',
            confirm: 'Changer le type',
          },
        },
      },
      Card: {
        enabled: 'Activé',
        disabled: 'Désactivé',
        enableAction: 'Activer',
        disableAction: 'Désactiver',
        enabledSuccess: 'Feature flag activé avec succès',
        disabledSuccess: 'Feature flag désactivé avec succès',
        confirmEnableTitle: 'Activer {{name}} ?',
        confirmDisableTitle: 'Désactiver {{name}} ?',
        confirmToggleDescription:
          'Le changement s’applique immédiatement à toutes les évaluations de ce flag.',
        tryIt: 'Tester',
        view: 'Voir',
        configure: 'Configurer',
        targetingRules_one: 'règle de ciblage',
        targetingRules_other: 'règles de ciblage',
        variants_one: 'variante',
        variants_other: 'variantes',
        noTargeting:
          'Aucune règle de ciblage — toutes les évaluations retournent la valeur par défaut.',
        empty: 'Aucun feature flag pour le moment. Créez-en un pour commencer.',
      },
      TryIt: {
        title: 'Tester',
        description: 'Évaluer le flag',
        contextLabel: "Contexte d'évaluation",
        contextHint: 'Objet JSON — doit inclure "targetingKey".',
        invalidJson:
          'JSON invalide — veuillez corriger la syntaxe et réessayer.',
        missingTargetingKey:
          'Le contexte d\'évaluation doit inclure un champ "targetingKey".',
        result: 'Résultat',
        evaluatedValue: 'Valeur évaluée :',
        variant: 'Variante',
        close: 'Fermer',
        evaluate: 'Évaluer',
        evaluating: 'Évaluation…',
      },
      Types: {
        boolean: 'Booléen',
        string: 'String',
        number: 'Nombre',
        object: 'Objet (JSON)',
      },
      TargetingTypes: {
        basic: 'Ciblage simple',
        rollout_date: 'Rollout par date',
        rollout_percentage: 'Rollout par pourcentage',
      },
      CEL: {
        title: 'CEL (Common Expression Language)',
        description:
          'Évaluation de règles typée et sécurisée pour les feature flags',
        docs: 'Voir : https://github.com/google/cel-spec',
      },
      OpenFeature: {
        title: 'Compatible OpenFeature & OFREP',
        description:
          'Kaiten implémente les standards OpenFeature pour une évaluation de flags interopérable',
      },
    },
    Integrations: {
      title: 'Intégrations',
      PublishableKeys: {
        title: 'Clés publiables',
      },
      Connectors: {
        title: 'Connecteurs',
        pageDescription:
          'Synchronisez les données Kaiten avec vos outils CRM et de facturation. Chaque connecteur fonctionne indépendamment et se configure par organisation.',
        Status: {
          connected: 'Connecté',
          available: 'Disponible',
          comingH1: 'Prévu S1',
          comingH2: 'Prévu S2',
        },
        Sections: {
          connected: 'Connectés ({{count}})',
          crm: 'CRM',
          billing: 'Facturation',
          noConnectors: 'Aucun connecteur actif.',
        },
        Card: {
          connect: 'Connecter',
          manage: 'Gérer',
        },
        Toast: {
          connected: 'Connecteur Attio connecté.',
          disconnected: 'Connecteur Attio déconnecté.',
          mappingUpdated: 'Associations de champs Attio mises à jour.',
        },
        Wizard: {
          headerTitle: 'Connecter Attio',
          headerSubtitle:
            'Configurez le sens de synchronisation Kaiten → Attio',
          cancel: 'Annuler',
          back: 'Retour',
          continue: 'Continuer',
          finish: 'Terminer',
          stepProgress: 'Étape {{current}} sur {{total}}',
          Steps: {
            connect: 'Connexion',
            schema: 'Schéma',
          },
          Connect: {
            title: 'Connectez-vous à votre espace de travail Attio',
            description:
              "Collez un jeton d'API Attio. Vous pouvez en générer un dans Attio → Settings → Developers → API tokens. Le jeton est limité à un seul espace de travail Attio, où Kaiten synchronisera.",
            tokenLabel: "Jeton d'API Attio",
            tokenPlaceholder: 'atk_live_••••••••••••••••••',
            tokenHint:
              'Stocké chiffré. Révocable à tout moment depuis votre espace de travail Attio.',
            syncPolicyLabel: 'Politique de synchronisation',
            syncPolicyHint:
              "Comportement lorsqu'une fiche liée est absente lors d'une synchro.",
            SyncPolicy: {
              createAndBind: 'Créer & lier (recommandé)',
              failAndRetry: 'Échouer & réessayer',
            },
          },
          Schema: {
            title: 'Associez les données Kaiten à Attio',
            description:
              "Customer → Company Attio, Instance → Workspace Attio. Les valeurs sont synchronisées en texte. Les défauts ci-dessous sont toujours appliqués ; ajoutez des associations optionnelles vers des slugs d'attributs Attio existants.",
            defaultsTitle: 'Toujours synchronisé (défauts)',
            optionalTitle: 'Associations de champs optionnelles',
            addRow: 'Ajouter une association',
            selectSourceField: 'Sélectionnez un champ source…',
            searchSourceField: 'Rechercher un champ…',
            kaitenTable: 'Table Kaiten : {{table}}',
            attioSlugPlaceholder: 'attio_attribute_slug',
            invalidSlug:
              'Les slugs Attio sont en snake_case minuscule (lettres, chiffres, underscores).',
            incompleteMapping:
              'Choisissez un champ source Kaiten et un slug d’attribut Attio.',
            duplicateSource:
              'Chaque champ source Kaiten ne peut être associé qu’une fois.',
            duplicateTarget:
              'Deux champs d’un même objet Attio ne peuvent pas cibler le même slug d’attribut.',
            defaultBadge: 'Défaut',
            removeMapping: "Supprimer l'association",
            SourceFieldGroup: {
              company: 'Company (depuis Customer)',
              workspace: 'Workspace (depuis Instance)',
            },
            Table: {
              sourceField: 'Champ source Kaiten',
              attioObject: 'Objet Attio',
              attioSlug: 'Attribut Attio (slug)',
            },
            FooterNote: {
              title: 'Les attributs Attio doivent exister au préalable',
              description:
                "Les associations ciblent des slugs d'attributs Attio existants et sont écrites en texte. Créez d'abord l'attribut dans votre espace de travail Attio.",
              helpLink: 'Comment créer un attribut personnalisé dans Attio',
            },
          },
        },
        Detail: {
          subtitle:
            'Connecteur Attio limité au workspace, configuré pour cette organisation.',
          openInAttio: 'Ouvrir dans Attio',
          disconnect: 'Déconnecter',
          DisconnectDialog: {
            title: 'Déconnecter Attio ?',
            description:
              'Cette action supprime la configuration Attio enregistrée (clé API, politique de synchro, associations de champs) et arrête les synchronisations futures. Les enregistrements déjà créés dans Attio sont conservés.',
            confirmButton: 'Déconnecter',
          },
          Config: {
            syncPolicy: 'Politique de synchro',
            fieldMappings: 'Associations de champs',
            apiUrl: 'URL API Attio',
          },
          EditMapping: {
            title: 'Modifier les associations de champs',
            description:
              "Ajustez les associations optionnelles champ source → attribut Attio. Les défauts s'appliquent toujours ; les changements ne concernent que les prochaines synchros.",
          },
          SyncedRecords: {
            title: 'Enregistrements synchronisés',
            description:
              'Customers et instances Kaiten liés à une fiche Attio.',
            refresh: 'Rafraîchir',
            loading: 'Chargement des enregistrements…',
            error: 'Échec du chargement des enregistrements.',
            empty:
              'Aucun enregistrement synchronisé vers Attio pour le moment.',
            never: 'Jamais',
            statusSynced: 'Synchronisé',
            statusError: 'Erreur',
            Table: {
              record: 'Enregistrement Kaiten',
              object: 'Objet Attio',
              recordId: 'Id de fiche Attio',
              syncedAt: 'Synchronisé le',
              status: 'Statut',
            },
          },
        },
        EntitySync: {
          title: 'Synchronisation Attio',
          customerDescription: 'Ce client est lié à une société du CRM',
          instanceDescription: 'Cette instance est liée à un workspace du CRM',
          domain: 'Domaine',
          syncStatus: 'Statut de synchro',
          lastSynced: 'Dernière synchro',
          never: 'Jamais',
          viewInCrm: 'Voir dans le CRM',
          openInAttio: 'Ouvrir dans Attio',
          tooltipTitle: 'Synchronisé avec Attio',
          statusSynced: 'Synchronisé avec Attio',
          statusError: 'Erreur de synchro Attio',
          statusPending: 'Synchronisation Attio en cours',
          statusPendingShort: 'En cours',
          statusDelayed:
            'La synchronisation Attio prend plus de temps que prévu',
          pendingDescription:
            'Kaiten crée l’enregistrement correspondant dans Attio.',
          updatingDescription:
            'Kaiten met à jour l’enregistrement correspondant dans Attio.',
          delayedDescription:
            'La synchronisation continue ou sera relancée en arrière-plan.',
          errorDialog: {
            openLabel: 'Voir le détail de l’erreur de synchronisation Attio',
            title: 'Erreur de synchronisation Attio',
            description:
              'Consultez la dernière erreur retournée lors de la synchronisation de cet enregistrement avec Attio.',
            recordId: 'ID de fiche Attio',
            lastAttempt: 'Dernière tentative',
            errorDetails: 'Détail de l’erreur',
          },
        },
      },
      ServiceAccounts: {
        title: 'Comptes de service',
        description:
          "Les comptes de service permettent d'authentifier des applications et services avec des permissions granulaires par scope",
        createButton: 'Créer un compte de service',
        emptyState:
          "Aucun compte de service pour l'instant. Créez-en un pour commencer.",
        tokensCount: '{{count}} token',
        tokensCount_other: '{{count}} tokens',
        createdAt: 'Créé le',
        generateToken: 'Générer un token',
        noTokens:
          'Aucun token pour ce compte de service. Générez-en un pour commencer.',
        noActiveTokens: 'Aucun token actif. Tous les tokens ont été révoqués.',
        noRevokedTokens: 'Aucun token révoqué.',
        deleteServiceAccount: 'Supprimer le compte de service',
        Filters: {
          activeTokens: 'Tokens actifs',
          revokedTokens: 'Tokens révoqués',
        },
        Dialog: {
          createTitle: 'Créer un compte de service',
          createDescription:
            'Créer un nouveau compte de service pour authentifier vos applications et services.',
          nameLabel: 'Nom',
          namePlaceholder: 'ex. Pipeline CI/CD',
          nameDescription:
            'Choisissez un nom descriptif pour ce compte de service',
          nameRequired: 'Le nom est requis',
          createButton: 'Créer',
        },
        NewToken: {
          title: 'Nouveau token',
          description: 'Pour le compte de service {{name}}',
          Details: {
            title: 'Détails',
            nameLabel: 'Nom',
            namePlaceholder: 'ex. SDK de production',
            nameDescription:
              'Indiquez où le token sert, pour savoir lequel révoquer',
            nameRequired: 'Le nom du token est requis',
            expirationLabel: "Date d'expiration",
            expirationDescription:
              "Laissez vide pour un token qui n'expire jamais",
          },
          Access: {
            title: 'Accès',
            description:
              "Ce que ce token peut atteindre : partez d'un préréglage, puis ajustez chaque ressource.",
            adjust: 'Ajuster par ressource',
            dialogTitle: 'Accès par ressource',
            dialogDescription: "Choisissez l'accès de chaque ressource.",
            done: 'Terminé',
            clear: 'Effacer',
            accessRequired: 'Accordez un accès à au moins une ressource',
            summary: '{{count}} scope',
            summary_other: '{{count}} scopes',
            empty: 'Aucun accès sélectionné',
          },
          onceWarning:
            "Le token n'est affiché qu'une fois, juste après sa création : Kaiten n'en garde qu'une empreinte.",
          submit: 'Créer le token',
          Created: {
            title: 'Token créé',
            description: '{{token}}, pour le compte de service {{name}}',
            copyTitle: 'Copiez votre token maintenant',
            copyWarning:
              'Vous ne pourrez plus le voir une fois cette page quittée.',
            copyToken: 'Copier le token',
            copied: 'Token copié dans le presse-papiers',
            detailsTitle: 'Détails',
            scopes: 'Scopes',
            expires: 'Expire',
            never: 'Jamais',
            done: 'Retour aux comptes de service',
          },
        },
        Scopes: {
          presetGrants: '{{level}} : {{resources}}',
          levelsLabel: 'Accès : {{resource}}',
          Levels: {
            none: 'Aucun accès',
            read: 'Lecture',
            write: 'Lecture et écriture',
          },
          Groups: {
            customers: { label: 'Clients' },
            licensing: { label: 'Licences' },
            featureFlags: { label: 'Feature flags' },
            releases: { label: 'Releases' },
            billing: { label: 'Facturation' },
            organization: { label: 'Organisation' },
          },
          Presets: {
            dataPlane: {
              label: 'Plan de données',
              description:
                "Un SDK dans votre produit : évalue les flags, lit les licences, remonte l'usage",
            },
            controlPlane: {
              label: 'Plan de contrôle',
              description:
                'Une automatisation qui pilote votre parc : clients, licences, releases, déploiements',
            },
          },
          Resources: {
            components: {
              label: 'Composants',
              description:
                'Accès aux versions de composants livrées dans les releases',
            },
            customers: {
              label: 'Clients',
              description: 'Accès aux données et à la gestion des clients',
            },
            featureFlags: {
              label: 'Feature flags',
              description: 'Accès à la configuration des feature flags',
            },
            instances: {
              label: 'Instances',
              description:
                "Accès à la gestion des instances et aux remontées d'usage",
            },
            licenses: {
              label: 'Licences',
              description: 'Accès à la gestion des licences',
            },
            entitlements: {
              label: 'Droits',
              description: 'Accès aux définitions de droits',
            },
            deploymentZones: {
              label: 'Zones de déploiement',
              description: 'Accès à la gestion des zones de déploiement',
            },
            releases: {
              label: 'Releases',
              description: 'Accès à la gestion des releases',
            },
            metadataFields: {
              label: 'Champs de métadonnées',
              description: 'Accès aux définitions des champs de métadonnées',
            },
            notifications: {
              label: 'Notifications',
              description:
                'Accès à son propre fil de notifications et à ses préférences',
            },
            billing: {
              label: 'Facturation',
              description:
                'Accès aux abonnements, aux factures, à la file de transmission et aux réglages de facturation',
            },
            organizations: {
              label: 'Organisations',
              description:
                "Accès aux paramètres de l'organisation et aux connecteurs",
            },
            tokens: {
              label: 'Tokens',
              description: 'Accès aux comptes de service et à leurs tokens',
            },
            webhooks: {
              label: 'Webhooks',
              description: 'Accès aux abonnements webhooks sortants',
            },
          },
        },
        Token: {
          expired: 'Expiré',
          expires: 'Expire',
          revoked: 'Révoqué',
          scopes: 'Scopes',
          externalId: 'ID externe',
          createdBy: 'Créé par',
          revokedOn: 'Révoqué',
          by: 'par',
          revoke: 'Révoquer',
          revokeConfirmTitle: 'Révoquer le token',
          revokeConfirmDescription:
            'Voulez-vous vraiment révoquer le token « {{name}} » ? Cette action est irréversible.',
          revokeSuccess: 'Token révoqué avec succès',
          typeCustom: 'Personnalisé',
          filterAll: 'Tous',
          filterActive: 'Actifs',
          filterRevoked: 'Révoqués',
        },
      },
      Webhooks: {
        sectionTitle: 'Webhooks',
        sectionDescription:
          'Configurez des webhooks pour les événements du cycle de vie',
        pageDescription:
          "Configurez des webhooks d'événements et consultez l'historique récent des livraisons.",
        title: "Webhooks d'événements",
        description:
          'Configurez des webhooks déclenchés lorsque des événements du cycle de vie spécifiques se produisent. Vous pouvez sélectionner plusieurs événements pour un même webhook.',
        newButton: 'Nouveau webhook',
        emptyState: 'Aucun webhook configuré pour le moment.',
        emptyStateHint:
          'Créez un webhook pour recevoir des notifications quand des événements se produisent.',
        Tabs: {
          event: 'Événements',
          history: 'Historique',
        },
        EventGroups: {
          customer: 'Clients',
          instance: 'Instances',
          license: 'Licences',
          licenseFamily: 'Familles de licences',
          entitlement: 'Droits',
          entitlementGroup: 'Groupes de droits',
          usage: 'Utilisation',
          subscription: 'Abonnements',
          invoice: 'Factures',
          featureFlag: 'Feature flags',
          release: 'Releases',
          deploymentZone: 'Zones de déploiement',
          component: 'Components',
          metadataField: 'Champs de métadonnées',
          identity: 'Identité et accès',
          other: 'Autres événements',
        },
        Filters: {
          queryPlaceholder: 'Rechercher des webhooks',
        },
        Table: {
          events: 'Événements',
          url: 'URL du webhook',
          signingSecret: 'Secret de signature',
          created: 'Créé',
          showSigningSecret: 'Afficher le secret de signature',
          hideSigningSecret: 'Masquer le secret de signature',
          copySigningSecret: 'Copier le secret de signature',
          signingSecretCopied: 'Secret de signature copié',
          signingSecretLoadError:
            'Impossible de charger le secret de signature',
          signingSecretCopyError: 'Impossible de copier le secret de signature',
        },
        Dialog: {
          title: 'Nouveau webhook',
          description:
            'Configurez un webhook pour recevoir des notifications quand des événements du cycle de vie se produisent. Sélectionnez un ou plusieurs événements pour déclencher ce webhook.',
          eventsLabel: 'Événements',
          eventsSelected: 'sélectionné(s)',
          selectedEvents: 'Événements sélectionnés',
          selectedEventsPlaceholder:
            'Aucun événement sélectionné pour le moment.',
          eventsRequired: 'Sélectionnez au moins un événement.',
          urlLabel: 'URL du webhook',
          urlPlaceholder: 'https://api.example.com/webhooks/kaiten',
          urlRequired: "L'URL du webhook est requise.",
          urlInvalid: 'Saisissez une URL valide.',
          urlDescription:
            "Le webhook recevra une requête POST avec la charge utile de l'événement lorsqu'un des événements sélectionnés se produit",
          createButton: 'Créer le webhook',
        },
        History: {
          sectionTitle: 'Historique des webhooks',
          sectionDescription:
            "Historique des livraisons de webhooks avec le statut et les détails d'échec",
          description:
            "Tentatives de livraison récentes pour vos webhooks. Les livraisons échouées incluent les détails de l'erreur.",
          emptyState: 'Aucune livraison de webhook pour le moment.',
          emptyStateHint:
            'Les livraisons apparaîtront ici après le déclenchement de vos webhooks.',
          Filters: {
            queryPlaceholder: 'Rechercher des livraisons',
          },
          filterBy: 'Filtrer par',
          eventFilter: 'Événement',
          hookFilter: 'URL du webhook',
          allEvents: 'Tous les événements',
          allWebhooks: 'Tous les webhooks',
          Stats: {
            total: 'Total : {{count}}',
            success: 'OK : {{count}}',
            failed: 'Échecs : {{count}}',
          },
          Status: {
            success: 'OK',
            pending: 'En attente',
            fail: 'Échec',
            sending: 'En cours',
          },
          Table: {
            date: 'Date',
            hookUrl: 'URL du webhook',
            event: 'Événement',
            status: 'Statut',
            failureInfo: "Informations d'échec",
            actions: 'Actions',
            viewDetails: 'Voir les détails',
            emptyState:
              'Aucune livraison ne correspond aux filtres sélectionnés.',
          },
          FailureDialog: {
            title: "Détails de l'échec de livraison",
            description: '{{eventName}} à {{deliveredAt}}',
            hookLabel: 'Webhook :',
            statusCodeLabel: 'Statut HTTP :',
            responseLabel: 'Réponse :',
          },
        },
      },
    },
    Billing: {
      title: 'Facturation',
      Invoices: {
        title: 'Factures',
        subtitle:
          'Toutes les factures de votre organisation, tous clients et instances confondus.',
        loading: 'Chargement des factures',
        shown_one: '{{count}} facture affichée',
        shown_other: '{{count}} factures affichées',
        loadMore: 'Charger plus',
        Lines: {
          title: 'Lignes',
        },
        Empty: {
          title: 'Aucune facture pour le moment',
          description:
            'Une facture est composée lorsqu’un abonnement atteint une échéance. Abonnez une instance pour commencer à facturer.',
          instances: 'Aller aux instances',
          filteredTitle: 'Aucune facture ne correspond à ces filtres',
          filteredDescription:
            'Retirez un filtre ou élargissez la période pour en voir davantage.',
        },
        Filters: {
          button: 'Filtres',
          panelLabel: 'Filtres des factures',
          clear: 'Effacer les filtres',
          remove: 'Retirer le filtre {{filter}}',
          chip: '{{field}} : {{value}}',
          status: 'Statut',
          kind: 'Type',
          provider: 'Fournisseur',
          handoff: 'Transmission',
          overdue: 'En retard',
          overdueOnly: 'Factures en retard uniquement',
          held: 'Bloquées',
          heldOnly: 'Brouillons bloqués uniquement',
          customer: 'Client',
          instance: 'Instance',
          slugPlaceholder: 'slug',
          boundary: 'Échéance',
          issued: 'Émission',
          openEnd: 'sans limite',
        },
        Export: {
          button: 'Exporter',
          csvLines: 'CSV par ligne de facture',
          csvInvoices: 'CSV par facture',
          ndjson: 'NDJSON, une facture par ligne',
        },
        Toasts: {
          released: 'Facture débloquée',
          paid: 'Facture marquée comme payée',
          writtenOff: 'Facture passée en perte',
          voided: 'Facture annulée',
          recomposed: 'Facture recomposée',
          replaced: 'Facture de remplacement composée',
        },
        Detail: {
          title: '{{kind}} · facture du {{date}}',
          subtitle: '{{customer}} · {{instance}}',
          Actions: {
            menu: 'Actions',
            markPaid: 'Marquer comme payée',
            recompose: 'Recomposer',
            releaseHold: 'Débloquer la facture',
            void: 'Annuler la facture',
            writeOff: 'Passer en perte',
            purgedUsage:
              'L’usage de cette période n’est plus conservé (avant le {{date}}) : une recomposition omettrait ses lignes d’usage.',
            instanceDeleted:
              'L’instance de cette facture a été supprimée : rien ne peut être recomposé pour elle.',
          },
          Chain: {
            label: 'Chaîne de remplacement',
            replaces: 'Remplace',
            replacedBy: 'Remplacée par',
          },
          Hold: {
            title: 'Bloquée : {{reason}}',
            description:
              'Après la clôture de la période, le journal d’usage de cette facture a échoué à un contrôle de cohérence. La facture a été composée mais pas émise : la facturation ne facture pas un montant dont elle ne peut pas répondre.',
            Columns: {
              meter: 'Compteur',
              check: 'Contrôle',
              expected: 'Attendu',
              found: 'Constaté',
              reports: 'Rapports',
              counter: 'Rapport du compteur',
            },
            release_NOOP:
              'Le déblocage accepte les montants tels que composés. La facture est émise sans fournisseur de paiement et attend votre ERP dans la file de transmission.',
            release_STRIPE:
              'Le déblocage accepte les montants tels que composés. La facture est envoyée à Stripe, qui l’encaisse.',
            recompose:
              'La recomposition compose à nouveau la facture à partir du journal d’usage tel qu’il est maintenant, avec le fournisseur actuel de l’abonnement.',
          },
          Summary: {
            title: 'Résumé',
            kind: 'Type',
            boundary: 'Échéance',
            period: 'Période de service',
            provider: 'Fournisseur',
            issued: 'Émise le',
            due: 'Échéance de paiement',
            dueValue_one: '{{date}} · {{count}} jour pour payer',
            dueValue_other: '{{date}} · {{count}} jours pour payer',
            paid: 'Payée le',
            writtenOff: 'Passée en perte le',
            voided: 'Annulée le',
            voidReason: 'Motif d’annulation',
            released: 'Blocage levé',
            releasedValue:
              '{{date}}, par une personne, pour ce motif : {{reason}}',
            releasedAutomatically:
              '{{date}}, automatiquement : un contrôle ultérieur a jugé le journal d’usage sain',
          },
          Lines: {
            title: 'Lignes',
            viewReports_one: 'Voir {{count}} rapport d’usage',
            viewReports_other: 'Voir {{count}} rapports d’usage',
          },
          Handoff: {
            title: 'Transmission',
            waiting:
              'Un job ou la CLI la prend dans la file, la comptabilise et l’acquitte.',
            waiting_VOID:
              'Cette facture est annulée et sa transmission reste en attente : le système qui lit la file la voit comme annulée, et l’acquitte.',
            waiting_UNCOLLECTIBLE:
              'Cette facture a été passée en perte et sa transmission reste en attente : le système qui lit la file la voit comme passée en perte, et l’acquitte.',
            claims: 'Réservations',
            leasedUntil: 'Réservée jusqu’au',
            reference: 'Référence ERP',
            noReference: 'Acquittée sans référence',
            acknowledgedAt: 'Acquittée le',
          },
          Identity: {
            title: 'Facturée à',
            description:
              'Tel qu’au moment de la composition de la facture. Un changement de nom depuis ne la modifie pas.',
            customer: 'Client',
            instance: 'Instance',
            license: 'Licence',
            billingEmail: 'E-mail de facturation',
            customerInvoices: 'Factures de ce client',
            instanceInvoices: 'Factures de cette instance',
          },
          MarkPaid: {
            title: 'Marquer comme payée',
            description:
              'Enregistrez que cette facture a été payée. Les heures sont lues en UTC.',
            descriptionPending:
              'Enregistrez que cette facture a été payée. Cela acquitte aussi la facture dans la file de transmission, sous la référence indiquée.',
            reference: 'Référence externe',
            referenceHint:
              'Le numéro de la facture dans votre ERP, {{max}} caractères au plus. Facultatif.',
            paidAt: 'Payée le (UTC)',
            paidAtHint: 'Maintenant ou avant. Laissez vide pour maintenant.',
            note: 'Note',
            noteHint:
              'Par exemple la référence du virement. Elle n’est conservée que dans l’événement de paiement.',
            confirm: 'Marquer comme payée',
          },
          Release: {
            title: 'Débloquer la facture',
            description:
              'Accepter les montants tels que composés, bien que le journal d’usage n’ait pas pu les garantir. La facture est ensuite émise.',
            reason: 'Motif',
            reasonHint:
              'Pourquoi les montants sont fiables. Conservé avec votre nom dans le journal d’audit.',
            effect_NOOP:
              'La facture est émise sans fournisseur de paiement et attend votre ERP dans la file de transmission.',
            effect_STRIPE: 'La facture est envoyée à Stripe, qui l’encaisse.',
            confirm: 'Débloquer',
          },
          Recompose: {
            title: 'Recomposer la facture',
            descriptionHeld:
              'Composer à nouveau ce brouillon bloqué à partir du journal d’usage tel qu’il est maintenant.',
            descriptionVoid:
              'Composer une facture de remplacement pour l’échéance que cette facture annulée facturait.',
            effectHeld:
              'Le brouillon est réécrit sur place. Si le journal est sain, la facture est émise avec le fournisseur actuel de l’abonnement.',
            effectVoid:
              'La remplaçante est émise avec le fournisseur actuel de l’abonnement, et cette facture pointe vers elle.',
            confirm: 'Recomposer',
          },
          Void: {
            title: 'Annuler la facture',
            descriptionNoop:
              'L’annulation retire la facture de l’échéance qu’elle facturait, qu’une recomposition peut ensuite remplir. Une transmission en attente reste en attente, avec l’annulation dans sa charge utile.',
            descriptionProvider:
              'La facture est d’abord annulée chez votre fournisseur de paiement, puis ici. Cette action est irréversible.',
            reason: 'Motif',
            confirm: 'Annuler la facture',
          },
          VoidThenRecompose: {
            title: 'Annuler et recomposer',
            description:
              'Cette facture n’est pas un brouillon bloqué : elle ne peut pas être modifiée. Elle est annulée, puis une remplaçante est composée à partir du journal d’usage tel qu’il est maintenant. Un seul motif couvre les deux.',
            confirm: 'Annuler et recomposer',
          },
          WriteOff: {
            title: 'Passer la facture en perte',
            description:
              'Renoncer à encaisser cette facture. Elle devient irrécouvrable, ce qui est définitif. Une transmission en attente reste en attente.',
            reason: 'Motif',
            confirm: 'Passer en perte',
          },
        },
        Drilldown: {
          subtitle: 'Usage derrière une ligne de cette facture : {{invoice}}',
          backToInvoice: 'Retour à la facture',
          region: 'Rapports d’usage de la ligne',
          export: 'Exporter en CSV',
          loading: 'Chargement des rapports d’usage',
          Empty: {
            title: 'Aucun rapport d’usage',
            description:
              'Aucun rapport n’a été accepté pendant la période de cette ligne.',
          },
          Summary: {
            title: 'Cette ligne',
            period: 'Période de service',
            measured: 'Quantité mesurée',
            billed: 'Quantité facturée',
            saleUnit: 'Unités mesurées par unité de vente',
            windows: 'Fenêtres de remise à zéro',
            windowsValue_one: '{{count}} fenêtre',
            windowsValue_other: '{{count}} fenêtres',
            windowsFloored_one:
              '{{count}} fenêtre a un mouvement négatif, comptée pour 0',
            windowsFloored_other:
              '{{count}} fenêtres ont un mouvement négatif, comptées pour 0',
            amount: 'Montant de la ligne',
          },
          lifetime: 'Toute la durée de vie',
          windowUsage_one: '{{count}} rapport · usage {{sum}}',
          windowUsage_other: '{{count}} rapports · usage {{sum}}',
          windowOverage_one: '{{count}} rapport · dépassement {{sum}}',
          windowOverage_other: '{{count}} rapports · dépassement {{sum}}',
          windowPartial_one:
            '{{count}} rapport pour l’instant · d’autres à charger',
          windowPartial_other:
            '{{count}} rapports pour l’instant · d’autres à charger',
          shown_one: '{{count}} rapport affiché',
          shown_other: '{{count}} rapports affichés',
          loadMore: 'Charger plus de rapports',
          OutsideRetention: {
            title: 'Les rapports de cette ligne ne sont plus conservés',
            description:
              'L’usage derrière cette ligne est plus ancien que l’historique conservé par votre organisation. La facture en a gardé l’empreinte : les rapports dont elle a été mesurée et leur somme.',
            kept: 'Ce que la facture a conservé',
          },
        },
      },
      Handoff: {
        title: 'Transmission',
        subtitle:
          'Les factures en attente de votre ERP, les plus anciennes d’abord. Un job ou la CLI les prend dans la file et les acquitte une fois comptabilisées.',
        Tabs: {
          label: 'Partie de la file',
          pending: 'En attente',
          acknowledged: 'Acquittées',
        },
        loading: 'Chargement de la file',
        shown_one: '{{count}} facture affichée',
        shown_other: '{{count}} factures affichées',
        loadMore: 'Charger plus',
        Columns: {
          issued: 'Émise le',
          booked: 'Comptabilisée',
          claims: 'Réservations',
        },
        claims_one: '{{count}} réservation',
        claims_other: '{{count}} réservations',
        reservedUntil: 'Réservée jusqu’au {{date}}',
        noReference: 'Sans référence',
        acknowledge: 'Acquitter',
        Empty: {
          pendingTitle: 'Rien n’attend votre ERP',
          pendingDescription:
            'Les factures qu’aucun fournisseur de paiement n’encaisse attendent ici qu’un job ou un terminal les prenne. Pour les prendre depuis un terminal, lancez :',
          acknowledgedTitle: 'Rien n’a encore été acquitté',
          acknowledgedDescription:
            'Les factures comptabilisées dans votre ERP apparaissent ici une fois acquittées.',
        },
        Acknowledge: {
          title: 'Acquitter la facture',
          description:
            'Enregistrez que votre ERP a comptabilisé cette facture. Ne le faites que pour une facture que vous avez comptabilisée vous-même : un job ou la CLI acquitte celles qu’il prend.',
          leased:
            'Un consommateur détient cette facture jusqu’au {{date}}. L’acquitter maintenant peut la comptabiliser deux fois.',
          reference: 'Référence externe',
          referenceHint:
            'Le numéro de la facture dans votre ERP, {{max}} caractères au plus. Facultatif.',
          confirm: 'Acquitter',
        },
        Toasts: {
          acknowledged: 'Facture acquittée',
        },
      },
    },
    Addons: {
      title: 'Options',
      Compatibility: {
        title: 'Licences compatibles',
      },
    },
    Vouchers: {
      title: 'Codes promo',
    },
    Notifications: {
      title: 'Notifications',
      subtitle: "Tout ce qui s'est passé dans votre organisation.",
      markAllRead: 'Tout marquer comme lu',
      preferences: 'Préférences',
      tabs: {
        all: 'Toutes',
        unread: 'Non lues',
        unreadWithCount_one: 'Non lue ({{count}})',
        unreadWithCount_other: 'Non lues ({{count}})',
        label: 'Filtrer par statut',
      },
      item: {
        unread: 'Non lue',
        read: 'Lue',
      },
      table: {
        event: 'Événement',
        status: 'Statut',
        time: 'Heure',
      },
      filters: {
        objectType: 'Objet',
        objectTypes: {
          instance: 'Instance',
          customer: 'Client',
          release: 'Release',
          deployment_zone: 'Zone de déploiement',
          component: 'Composant',
          license: 'Licence',
          token: 'Jeton',
        },
      },
      bell: {
        label: 'Notifications',
        labelUnread_one: 'Notifications, {{count}} non lue',
        labelUnread_other: 'Notifications, {{count}} non lues',
        unreadBadge_one: '{{count}} non lue',
        unreadBadge_other: '{{count}} non lues',
        viewAll: 'Voir toutes les notifications',
      },
      feed: {
        empty: 'Vous êtes à jour',
        emptyDescription: 'Les nouvelles notifications apparaîtront ici.',
        emptyUnread: 'Aucune notification non lue',
        emptyUnreadDescription: 'Tout a été lu.',
        emptyFiltered: 'Aucune notification ne correspond à ces filtres',
        emptyFilteredDescription:
          "Essayez un autre type d'objet, ou réinitialisez les filtres.",
        error: 'Impossible de charger les notifications.',
        loadMore: 'Charger plus',
        today: "Aujourd'hui",
        yesterday: 'Hier',
        eventsCount_one: '{{count}} notification',
        eventsCount_other: '{{count}} notifications',
      },
    },
    AuditTrail: {
      title: "Journal d'audit",
      subtitle:
        'Un flux antéchronologique des événements de toutes les instances.',
      autoRefresh: 'Actualisation automatique',
      export: 'Exporter',
      exported_one: '{{count}} événement exporté (CSV)',
      exported_other: '{{count}} événements exportés (CSV)',
      loadMore: 'Charger les événements plus anciens',
      stats: {
        totalEvents: 'Total des événements',
        latestEvents: '{{count}} derniers événements',
        read: 'Lectures',
        accepted: 'Acceptés',
        rejected: 'Rejetés',
        warnings: 'Avertissements',
        today: "Aujourd'hui",
      },
      table: {
        title: 'Journal des événements',
        description:
          'Événements de toutes les instances, les plus récents en premier.',
        searchPlaceholder: 'Rechercher par événement, instance ou client…',
        empty: "Aucune entrée du journal d'audit",
        actions: {
          viewDetails: 'Voir les détails',
        },
        headers: {
          event: 'Événement',
          instance: 'Instance',
          customer: 'Client',
          status: 'Statut',
          timestamp: 'Heure',
        },
        filters: {
          allEvents: 'Tous les événements',
          allInstances: 'Toutes les instances',
          allCustomers: 'Tous les clients',
          allStatuses: 'Tous les statuts',
          accepted: 'Accepté',
          read: 'Lecture',
          rejected: 'Rejeté',
          clear: 'Effacer les filtres',
          eventFilterLabel: 'Filtrer par événement',
          instanceFilterLabel: 'Filtrer par instance',
          customerFilterLabel: 'Filtrer par client',
          statusFilterLabel: 'Filtrer par statut',
          all: 'Tout',
          warning: 'Avertissement',
          eventType: "Type d'événement",
          shownOfTotal: '{{shown}} sur {{total}}',
          resultsCount_one: '{{count}} résultat',
          resultsCount_other: '{{count}} résultats',
        },
        range: {
          label: 'Filtrer par période',
          last24h: '24h',
          last7d: '7 jours',
          last30d: '30 jours',
          all: 'Tout le temps',
        },
      },
      detail: {
        eventId: "ID de l'événement",
        eventType: "Type d'événement",
        status: 'Statut',
        timestamp: 'Horodatage',
        instance: 'Instance',
        customer: 'Client',
        fullPayload: 'Charge utile complète',
      },
      feed: {
        today: "Aujourd'hui",
        yesterday: 'Hier',
        eventsCount_one: '{{count}} événement',
        eventsCount_other: '{{count}} événements',
      },
      Error: {
        title: "Impossible de charger le journal d'audit",
        description:
          "Le journal d'audit n'a pas pu être chargé pour le moment.",
      },
    },
    Settings: {
      title: 'Paramètres',
      subtitle:
        'Les réglages de votre organisation, et ce que ce navigateur mémorise.',
      groups: {
        organization: 'Organisation',
        browser: 'Ce navigateur',
      },
      Notifications: {
        title: 'Notifications',
        subtitle:
          'Choisissez les événements pour lesquels vous souhaitez être notifié.',
        cardDescription:
          'Choisissez les événements pour lesquels vous souhaitez être notifié.',
        configureButton: 'Configurer les notifications',
        summary:
          'Vous recevez {{enabled}} des {{total}} types de notification.',
        enableAll: 'Tout activer',
        pauseAll: 'Tout suspendre',
        saved: 'Enregistré',
        groupOnCount: '{{enabled}}/{{total}} activés',
        groupToggle: 'Basculer toutes les notifications {{group}}',
        Groups: {
          deployments: {
            label: 'Déploiements & releases',
            description: 'Cycle de vie des releases sur vos instances.',
          },
          instances: {
            label: 'Instances',
            description:
              'Provisionnement et cycle de vie des instances clients.',
          },
          usage: {
            label: 'Usage & limites',
            description:
              'Consommation des entitlements par rapport aux seuils.',
          },
          integrations: {
            label: 'Intégrations',
            description:
              'Webhooks sortants et synchronisations de connecteurs.',
          },
          customers: {
            label: 'Clients',
            description: 'Fiches clients et résultats d’onboarding.',
          },
          licensing: {
            label: 'Licences',
            description: 'Licences et entitlements qui y sont rattachés.',
          },
          security: {
            label: 'Sécurité',
            description: 'Identifiants émis pour votre organisation.',
          },
          other: {
            label: 'Autres',
            description: "Tout ce qui n'est couvert par aucun autre groupe.",
          },
        },
        Events: {
          INSTANCE_CREATED: 'Une instance a été créée pour un client.',
          INSTANCE_DEPLOYED:
            'Une instance a été placée dans une zone de déploiement.',
          INSTANCE_DELETED: 'Une instance a été supprimée ou déprovisionnée.',
          INSTANCE_MIGRATED: 'Une instance a changé de zone de déploiement.',
          INSTANCE_LIFECYCLE_STAGE_CHANGED:
            "Une instance a changé d'étape commerciale.",
          INSTANCE_STATUS_CHANGED:
            'Une instance a signalé un nouveau statut opérationnel.',
          INSTANCE_UPDATED:
            'Une instance a été modifiée. Se déclenche à chaque changement.',
          CUSTOMER_CREATED: 'Un nouveau client a été ajouté.',
          CUSTOMER_UPDATED: 'Une fiche client a été modifiée.',
          CUSTOMER_DELETED: 'Un client a été supprimé.',
          CUSTOMER_CREATION_REJECTED: "La création d'un client a été refusée.",
          RELEASE_CREATED:
            'Une nouvelle release est disponible dans le catalogue.',
          RELEASE_DEPLOYED:
            'Une release a été déployée dans une zone de déploiement.',
          RELEASE_DELETED: 'Une release a été retirée du catalogue.',
          DEPLOYMENT_ZONE_CREATED:
            'Une nouvelle zone de déploiement a été créée.',
          DEPLOYMENT_ZONE_DELETED: 'Une zone de déploiement a été supprimée.',
          COMPONENT_CREATED: 'Un composant a été ajouté au catalogue.',
          COMPONENT_UPDATED:
            "Un composant a été mis à jour, y compris par auto-versionnage lors d'une release.",
          INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
            "L'usage a dépassé le seuil d'alerte d'un entitlement.",
          INSTANCE_ENTITLEMENT_USAGE_REACHED:
            "L'usage a atteint la totalité d'un entitlement.",
          INSTANCE_ENTITLEMENT_CAP_EXCEEDED:
            "L'usage a atteint ou dépassé le plafond d'un entitlement.",
          ENTITLEMENT_USAGE_REPORT_REJECTED:
            "Un rapport d'usage a été refusé ; la mesure est interrompue pour cette instance.",
          INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
            "Une nouvelle période d'usage a commencé pour un entitlement.",
          LICENSE_CREATED: 'Une nouvelle licence a été créée.',
          LICENSE_UPDATED: 'Une licence a été modifiée.',
          LICENSE_DELETED: 'Une licence a été supprimée.',
          LICENSE_ENTITLEMENT_ASSIGNED:
            'Un entitlement a été ajouté à une licence.',
          LICENSE_ENTITLEMENT_UNASSIGNED:
            "Un entitlement a été retiré d'une licence.",
          SYSTEM_ORGANIZATION_TOKEN_ISSUED:
            'Un identifiant a été émis pour votre organisation.',
        },
      },
      App: {
        title: "Paramètres de l'application",
        description:
          "Gérer les paramètres locaux de l'application stockés dans votre navigateur.",
        language: 'Langue',
        languages: {
          en: 'English',
          fr: 'Français',
        },
        localStateTitle: 'Paramètres stockés dans le navigateur',
        localStateDescription:
          'Ces paramètres restent locaux à votre navigateur et sont partagés entre les onglets.',
        sideNavState: 'La navigation latérale est actuellement {{state}}.',
        sideNavExpanded: 'dépliée',
        sideNavCollapsed: 'repliée',
        resetButton: 'Réinitialiser les paramètres locaux',
        ResetDialog: {
          title: "Réinitialiser les paramètres locaux de l'application ?",
          description:
            'Cette action restaure la navigation latérale et les futurs paramètres stockés dans le navigateur à leurs valeurs par défaut sur cet appareil.',
          confirmButton: 'Réinitialiser les paramètres',
        },
      },
      Metadata: {
        title: 'Champs de métadonnées',
        subtitle:
          'Gérez les champs de métadonnées typés des zones de déploiement et des instances.',
        cardDescription:
          'Configurez les champs de métadonnées typés des zones de déploiement et des instances.',
        configureFieldsButton: 'Configurer les champs metadata',
        createButton: 'Créer un champ',
        activeCount: 'actifs',
        archivedCount: 'archivés',
        showArchived: 'Afficher les archivés',
        Restricted: {
          title: 'Accès restreint',
          description:
            'Vos scopes actuels ne permettent pas de lire les champs de métadonnées.',
          mutationToast:
            "Accès restreint : les modifications sont désactivées jusqu'au rechargement.",
          mutationBanner:
            "L'API a retourné un accès restreint. Les actions de modification sont désactivées jusqu'au prochain rechargement ou refetch.",
        },
        Error: {
          title: 'Impossible de charger les champs',
          description:
            'Les champs de métadonnées ne peuvent pas être chargés pour le moment.',
          mutationFallback: 'La mise à jour du champ de métadonnées a échoué.',
        },
        Empty: {
          title: 'Aucun champ de métadonnées',
          activeTitle: 'Aucun champ actif',
          description:
            'Créez un champ de métadonnées pour ajouter des métadonnées typées à cette ressource.',
          createButton: 'Créer votre premier champ',
        },
        Dialog: {
          createTitle: 'Créer un champ de métadonnées',
          editTitle: 'Modifier le champ de métadonnées',
          duplicateTitle: 'Dupliquer le champ de métadonnées',
          description:
            'Définissez le champ de métadonnées typé exposé sur cette ressource.',
          duplicateDescription:
            'Une copie du champ source avec une nouvelle clé. Ajustez le schema avant de sauver si nécessaire.',
          keyLabel: 'Clé',
          labelLabel: 'Libellé',
          typeLabel: 'Type primaire',
          optionsLabel: 'Options',
          optionsHint:
            'Une option par ligne. Les virgules sont conservées dans la valeur.',
          descriptionLabel: 'Description',
          descriptionPlaceholder:
            'Contexte optionnel pour les admins qui utilisent ce champ.',
          descriptionHint: 'Texte brut — le Markdown n’est pas rendu.',
          editRawSchema: 'Éditer le JSON Schema brut',
          useStructured: 'Utiliser l’éditeur structuré',
          rawSchemaLabel: 'JSON Schema brut',
          rawSchemaDraftTooltip:
            'Rédigé en JSON Schema draft 2020-12 — le dialecte qui détermine les mots-clés valides (type, enum, items, format, …).',
          rawSchemaHint:
            'Échappatoire — le serveur applique toujours les règles de transition et rejette les changements unsafe.',
        },
        List: {
          reorderField: 'Réordonner le champ',
          archivedBadge: 'Archivé',
          archiveButton: 'Archiver',
          duplicateButton: 'Dupliquer',
          readOnly: 'Lecture seule',
          unarchiveButton: 'Désarchiver',
        },
        Types: {
          unsupported: 'Non supporté',
        },
        Archive: {
          title: 'Archiver le champ de métadonnées ?',
          description:
            "Les champs archivés restent lisibles pour l'historique, mais ne peuvent plus être modifiés ni réordonnés.",
          confirmButton: 'Archiver',
          lastActiveWarning:
            'C’est le dernier champ actif pour cette ressource. Les colonnes et filtres dynamiques générés à partir du schema disparaîtront du tableau des ressources.',
        },
        DryRun: {
          title: 'Des valeurs existantes peuvent devenir invalides',
          description:
            '{{count}} valeur(s) existante(s) ne correspondent plus au nouveau schema.',
          examplesTitle: 'Exemples',
          confirmButton: 'Enregistrer quand même',
        },
        Toast: {
          created: 'Champ de métadonnées créé.',
          updated: 'Champ de métadonnées mis à jour.',
          archived: 'Champ de métadonnées archivé.',
          unarchived: 'Champ de métadonnées désarchivé.',
          reordered: 'Champs de métadonnées réordonnés.',
        },
      },
      Demo: {
        title: 'Bac à sable de démonstration',
        description:
          'Cette organisation est un bac à sable de démonstration en libre-service. Les données peuvent être réinitialisées à tout moment.',
        seedButton: 'Générer les données de démonstration',
        resetButton: 'Réinitialiser les données de démonstration',
        seedingProgress: 'Génération des données de démonstration…',
        ResetDialog: {
          title: 'Réinitialiser les données de démonstration ?',
          description:
            'Cette action efface toutes les données actuelles de l’organisation et régénère le jeu de données de démonstration.',
          confirmButton: 'Réinitialiser les données',
        },
      },
    },
  },
  Features: {
    Billing: {
      Unavailable: {
        DEPLOYMENT_DISABLED: {
          title: 'La facturation n’est pas activée',
          description:
            'La facturation est désactivée sur ce déploiement. Positionnez KAITEN_BILLING_ENABLED à true sur l’API pour l’activer.',
        },
        NOT_ENTITLED: {
          title: 'La facturation ne fait pas partie de votre offre',
          description:
            'L’offre de votre organisation n’inclut pas la facturation. Passez à une offre supérieure pour l’utiliser.',
        },
        MISSING_SCOPE: {
          title: 'Vous n’avez pas accès à la facturation',
          description:
            'La facturation ne peut pas être ouverte avec les accès de cette session.',
        },
        FEATURE_UNAVAILABLE: {
          title: 'Indisponible dans cette version',
          description:
            'Cette partie de la facturation n’est pas fournie par la version de Kaiten que vous utilisez.',
        },
        UNREACHABLE: {
          title: 'La facturation est injoignable',
          description:
            'Les capacités de facturation n’ont pas pu être chargées : la facturation reste masquée. Rien n’a été modifié. Réessayez dans un instant.',
        },
      },
      MissingScope: {
        title: 'Accès manquant',
        description: 'Le jeton de votre session ne porte pas le scope requis :',
        unknownScope: 'un scope requis par cette action',
        templateHint:
          'Si vous devriez l’avoir, le modèle de jeton de votre fournisseur d’identité doit lister les scopes de facturation (read:billing et write:billing).',
      },
      Problems: {
        title: 'La requête a été refusée',
        generic: 'Une erreur est survenue en dialoguant avec la facturation.',
        transient: 'Rien n’a été modifié. Vous pouvez réessayer.',
        providerUnreachable:
          'Le fournisseur de paiement est injoignable. Rien n’a été modifié.',
        reference: 'Référence {{id}}',
        outsideRetention: 'L’usage antérieur au {{date}} n’est plus conservé.',
      },
      InvoiceStatus: {
        DRAFT: 'Brouillon',
        MANUAL: 'Prêt à facturer',
        PUSHED: 'En attente de paiement',
        PAID: 'Payée',
        PUSH_FAILED: 'Envoi échoué',
        PAYMENT_FAILED: 'Paiement échoué',
        UNCOLLECTIBLE: 'Passée en perte',
        VOID: 'Annulée',
        held: 'Bloquée',
        overdue: 'En retard',
      },
      HoldReason: {
        LEDGER_SEQUENCE_GAP: 'Des rapports d’usage manquent dans le journal',
        LEDGER_CHAIN_BREAK: 'La chaîne du journal d’usage est rompue',
        LEDGER_COUNTER_MISMATCH:
          'Le compteur d’usage ne correspond pas au journal',
      },
      InvoiceLineType: {
        BASE: 'Forfait',
        ADDON: 'Option',
        USAGE: 'Consommation',
        OVERAGE: 'Dépassement',
        DISCOUNT: 'Remise',
        unknown: 'Autre',
      },
      SubscriptionStatus: {
        TRIAL: 'Essai',
        ACTIVE: 'Actif',
        PAST_DUE: 'En retard de paiement',
        CANCELED: 'Annulé',
        cancellationScheduled: 'Annulation en fin de période',
      },
      SubscriptionActions: {
        Reasons: {
          trial: 'Indisponible pendant un essai',
          cancellationScheduled: 'Réactivez d’abord l’abonnement',
        },
      },
      InvoiceKind: {
        ACTIVATION: 'Activation',
        RENEWAL: 'Renouvellement',
        FINAL: 'Finale',
      },
      InvoiceLines: {
        capped: 'Plafonnée',
        cappedExplanation:
          'L’échantillon dépasse ce que la licence accepte. Les rapports au-delà du plafond sont rejetés : l’excédent n’est donc pas facturé.',
        empty: 'Cette facture n’a aucune ligne.',
        Columns: {
          line: 'Ligne',
          servicePeriod: 'Période de service',
          amount: 'Montant',
        },
      },
      InvoiceTotals: {
        subtotal: 'Sous-total',
        discounts: 'Remises',
        total: 'Total',
      },
      InvoicePreview: {
        bannerTitle: 'Aperçu, pas une facture',
        bannerDescription:
          'Voici ce que serait la facture à une échéance maintenant. Rien n’est enregistré, envoyé ni facturé.',
        resultLabel: 'Aperçu de facture',
        composed: 'Facture de type {{kind}}, composée le {{asOf}}.',
      },
      Fingerprint: {
        empty: 'Aucun rapport d’usage sur cette période.',
        summary_one: 'Rapport {{first}} · {{count}} ligne · Σ {{sum}}',
        summary_other:
          'Rapports {{first}}–{{last}} · {{count}} lignes · Σ {{sum}}',
      },
      HandoffStatus: {
        PENDING: 'En attente de votre ERP',
        ACKNOWLEDGED: 'Acquittée',
        NOT_REQUIRED: 'Non requise',
      },
      Invoices: {
        notIssued: 'Non émise',
        Columns: {
          customer: 'Client',
          invoice: 'Facture',
          period: 'Période de service',
          total: 'Total',
          status: 'Statut',
          due: 'Échéance de paiement',
          provider: 'Fournisseur',
          handoff: 'Transmission',
        },
      },
      MarkPaid: {
        Errors: {
          referenceTooLong: 'La référence est trop longue',
          noteTooLong: 'La note est trop longue',
          paidAtInvalid: 'Saisissez une date et une heure valides',
          paidAtInFuture: 'Le paiement ne peut pas être dans le futur',
        },
      },
      Overage: {
        unlimited: 'Aucune limite',
        limit: 'Limite {{limit}} (+{{percent}} % accepté)',
        reports_one: '{{count}} rapport',
        reports_other: '{{count}} rapports',
        measured: 'Usage {{usage}}, dont {{overage}} au-dessus de la limite',
        limitsLabel: 'Limites appliquées',
      },
      ProviderKind: {
        NOOP: 'Manuel',
        STRIPE: 'Stripe',
      },
      Price: {
        perUnit: 'par {{unit}}',
        Models: {
          FLAT_FEE: {
            label: 'Forfait',
            blurb: 'Revient à chaque période, quantité 1.',
          },
          USAGE_BASED: {
            label: 'À l’usage',
            blurb: 'Mesuré dès la première unité, par unité de vente.',
          },
          OVERAGE: {
            label: 'Dépassement',
            blurb:
              'Facture seulement ce qui dépasse l’octroi, jusqu’à son plafond.',
          },
        },
        Timings: {
          ADVANCE: {
            label: 'À l’avance',
            blurb: 'Facture la période qui commence à l’échéance.',
          },
          ARREARS: {
            label: 'À terme échu',
            blurb: 'Facture la période qui se termine à l’échéance.',
          },
        },
        Periods: {
          MONTHLY: 'Mensuel',
          QUARTERLY: 'Trimestriel',
          SEMI_ANNUAL: 'Semestriel',
          ANNUAL: 'Annuel',
        },
        PeriodSuffix: {
          MONTHLY: '/mois',
          QUARTERLY: '/trimestre',
          SEMI_ANNUAL: '/semestre',
          ANNUAL: '/an',
        },
        Status: {
          ACTIVE: 'Actif',
          DEPRECATED: 'Déprécié',
        },
        ResetUnits: {
          HOUR: 'heure',
          DAY: 'jour',
          WEEK: 'semaine',
          MONTH: 'mois',
          YEAR: 'an',
        },
      },
      Reason: {
        description:
          'Obligatoire, {{max}} caractères au plus. Conservé avec votre nom dans le journal d’audit.',
        Errors: {
          required: 'Un motif est obligatoire',
          tooLong: 'Le motif est trop long',
        },
      },
      UsageReports: {
        Columns: {
          report: 'Rapport',
          reportedAt: 'Reçu le',
          behavior: 'Mode',
          value: 'Valeur',
          counter: 'Compteur',
          delta: 'Variation',
          overageDelta: 'Variation du dépassement',
          limit: 'Limite',
          transaction: 'Transaction',
          properties: 'Propriétés',
        },
        Behavior: {
          append: 'Ajout',
          set: 'Remplacement',
        },
        unlimited: 'Sans limite',
        limitChanged: 'Limite modifiée',
        propertiesTitle: 'Propriétés du rapport {{report}}',
        propertiesOpen: 'Afficher les propriétés du rapport {{report}}',
      },
      PeriodFilter: {
        from: 'Du',
        before: 'Avant le',
        periodInvalid: 'La période doit se terminer après son début.',
      },
      InvoicesCard: {
        title: 'Factures',
        loading: 'Chargement des factures',
        emptyTitle: 'Aucune facture pour le moment',
        shown_one: '{{count}} facture affichée',
        shown_other: '{{count}} factures affichées',
        loadMore: 'Charger plus',
      },
    },
    AuditTrail: {
      events: {
        COMPONENT_CREATED: 'Component ajouté',
        COMPONENT_DELETED: 'Component supprimé',
        COMPONENT_UPDATED: 'Component mis à jour',
        CUSTOMER_CREATED: 'Client créé',
        CUSTOMER_CREATION_REJECTED: 'Création de client refusée',
        CUSTOMER_DELETED: 'Client supprimé',
        CUSTOMER_UPDATED: 'Client mis à jour',
        DEPLOYMENT_ZONE_CREATED: 'Zone de déploiement créée',
        DEPLOYMENT_ZONE_DELETED: 'Zone de déploiement supprimée',
        DEPLOYMENT_ZONE_UPDATED: 'Zone de déploiement mise à jour',
        ENTITLEMENT_CREATED: 'Droit créé',
        ENTITLEMENT_DELETED: 'Droit supprimé',
        ENTITLEMENT_GROUP_CREATED: 'Groupe de droits créé',
        ENTITLEMENT_GROUP_DELETED: 'Groupe de droits supprimé',
        ENTITLEMENT_GROUP_UPDATED: 'Groupe de droits mis à jour',
        ENTITLEMENT_UPDATED: 'Droit mis à jour',
        ENTITLEMENT_USAGE_REPORT_ACCEPTED: 'Usage rapporté',
        ENTITLEMENT_USAGE_REPORT_REJECTED: 'Usage rejeté',
        ENTITLEMENT_VALUE_GET: 'Lecture de droit',
        FEATURE_FLAG_CREATED: 'Feature flag créé',
        FEATURE_FLAG_DELETED: 'Feature flag supprimé',
        FEATURE_FLAG_EVALUATED: 'Feature flag évalué',
        FEATURE_FLAG_UPDATED: 'Feature flag mis à jour',
        INSTANCE_BILLING_STARTED: 'Abonnement démarré',
        INSTANCE_CREATED: 'Instance créée',
        INSTANCE_DELETED: 'Instance supprimée',
        INSTANCE_DEPLOYED: 'Instance déployée',
        INSTANCE_ENTITLEMENT_CAP_EXCEEDED: 'Plafond du droit dépassé',
        INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
          "Nouvelle période d'usage",
        INSTANCE_ENTITLEMENT_USAGE_REACHED: 'Droit entièrement consommé',
        INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
          'Droit proche du seuil',
        INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED:
          'Transmission de facture confirmée',
        INSTANCE_INVOICE_HELD: 'Facture retenue',
        INSTANCE_INVOICE_ISSUED: 'Facture émise',
        INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE: 'Facture déclarée irrécouvrable',
        INSTANCE_INVOICE_PAID: 'Facture payée',
        INSTANCE_INVOICE_RELEASED: 'Facture retenue libérée',
        INSTANCE_INVOICE_VOIDED: 'Facture annulée',
        INSTANCE_LIFECYCLE_STAGE_CHANGED: "Cycle de vie de l'instance modifié",
        INSTANCE_MIGRATED: 'Instance migrée',
        INSTANCE_STATUS_CHANGED: "Statut de l'instance modifié",
        INSTANCE_UPDATED: 'Instance mise à jour',
        LICENSE_ARCHIVED: 'Version de licence archivée',
        LICENSE_CREATED: 'Licence créée',
        LICENSE_DELETED: 'Licence supprimée',
        LICENSE_ENTITLEMENT_ASSIGNED: 'Droit attribué à une licence',
        LICENSE_ENTITLEMENT_UNASSIGNED: "Droit retiré d'une licence",
        LICENSE_ENTITLEMENT_UPDATED: 'Droit modifié sur une licence',
        LICENSE_FAMILY_CREATED: 'Famille de licences créée',
        LICENSE_FAMILY_DELETED: 'Famille de licences supprimée',
        LICENSE_FAMILY_UPDATED: 'Famille de licences mise à jour',
        LICENSE_PRICE_CREATED: 'Prix de licence ajouté',
        LICENSE_PRICE_DEPRECATED: 'Prix de licence déprécié',
        LICENSE_PRICE_UPDATED: 'Prix de licence mis à jour',
        LICENSE_PUBLISHED: 'Version de licence publiée',
        LICENSE_UNARCHIVED: 'Version de licence désarchivée',
        LICENSE_UPDATED: 'Licence mise à jour',
        METADATA_FIELD_ARCHIVED: 'Champ de métadonnées archivé',
        METADATA_FIELD_CREATED: 'Champ de métadonnées créé',
        METADATA_FIELD_REORDERED: 'Champs de métadonnées réordonnés',
        METADATA_FIELD_UNARCHIVED: 'Champ de métadonnées désarchivé',
        METADATA_FIELD_UPDATED: 'Champ de métadonnées mis à jour',
        RELEASE_CREATED: 'Release publiée',
        RELEASE_DELETED: 'Release supprimée',
        RELEASE_DEPLOYED: 'Release déployée sur une zone',
        SYSTEM_ORGANIZATION_TOKEN_ISSUED: "Token d'organisation émis",
      },
    },
    EntitlementUsage: {
      status: {
        healthy: 'Sain',
        watch: 'À surveiller',
        nearLimit: 'Proche de la limite',
        inAllowance: 'Dépassement toléré',
        atLimit: 'Limite atteinte',
        overLimit: 'Au-delà de la limite',
        unlimited: 'Illimité',
      },
    },
    Targeting: {
      rule: 'Règle',
      variant: 'Variante',
      Types: {
        basic: 'Ciblage simple',
        rolloutDate: 'Rollout par date',
        rolloutPercentage: 'Rollout par pourcentage',
      },
      List: {
        title: 'Règles de ciblage',
        description:
          "Définissez les conditions d'évaluation du feature flag. L'ordre compte !",
        addButton: 'Ajouter une règle',
        addFirstButton: 'Ajouter une première règle',
        emptyState:
          "Aucune règle de ciblage pour l'instant. Cliquez sur le bouton ci-dessus pour ajouter votre première règle.",
        noVariantsWarning:
          "Veuillez définir des variantes à l'étape 2 avant d'ajouter des règles de ciblage.",
        deleteConfirmTitle: 'Supprimer la règle de ciblage ?',
        deleteConfirmDescription:
          'Cette action est irréversible. La règle de ciblage sera définitivement supprimée.',
      },
      Dialog: {
        titleCreate: 'Créer une règle de ciblage',
        titleEdit: 'Modifier la règle de ciblage',
        description:
          'Configurez les conditions de ciblage avec des expressions CEL',
        selectType: 'Type de ciblage',
        basicDescription:
          "Règle simple qui renvoie une seule variante quand l'expression CEL est vraie",
        rolloutDateDescription:
          'Déploiement progressif dans le temps avec dates de début et de fin',
        rolloutPercentageDescription:
          'A/B testing avec distribution en pourcentage entre les variantes',
      },
      BasicForm: {
        name: 'Nom',
        namePlaceholder: 'Clients Enterprise',
        rule: 'Expression CEL',
        rulePlaceholder:
          "__kaiten.license.familySlug == 'scale' && __kaiten.deploymentZone.type == 'production'",
        ruleDescription:
          "Expression CEL à évaluer (ex. __kaiten.deploymentZone.type == 'production')",
        variant: 'Variante',
        variantPlaceholder: 'Sélectionner une variante',
      },
      RolloutDateForm: {
        name: 'Nom',
        namePlaceholder: 'Rollout progressif EU',
        rule: 'Expression CEL',
        rulePlaceholder: "__kaiten.deploymentZone.type == 'production'",
        ruleDescription:
          "Expression CEL à évaluer (ex. __kaiten.deploymentZone.type == 'production')",
        startConfiguration: 'Configuration de début',
        endConfiguration: 'Configuration de fin',
        startDate: 'Date de début',
        startPercentage: 'Pourcentage de début',
        startVariant: 'Variante de début',
        endDate: 'Date de fin',
        endPercentage: 'Pourcentage de fin',
        endVariant: 'Variante de fin',
        variantPlaceholder: 'Sélectionner une variante',
      },
      RolloutPercentageForm: {
        name: 'Nom',
        namePlaceholder: 'A/B test Premium',
        rule: 'Expression CEL',
        rulePlaceholder: "__kaiten.license.familySlug == 'scale'",
        ruleDescription:
          'Expression CEL déterminant les utilisateurs éligibles',
        distribution: 'Distribution en pourcentage',
        addVariant: 'Ajouter une variante',
        noVariants:
          'Aucune variante dans la distribution. Cliquez sur « Ajouter une variante » pour commencer.',
        total: 'Total',
        distributionError: 'Le total des pourcentages doit être égal à 100 %',
        equalDistribution: 'Répartir équitablement entre toutes les variantes',
      },
      Errors: {
        distributionSum:
          'La somme des pourcentages de distribution doit être 100',
        nameRequired: 'Le nom est requis',
        ruleRequired: 'La règle CEL est requise',
        invalidCel: 'Expression CEL invalide',
        variantRequired: 'La variante est requise',
        startDateRequired: 'La date de début est requise',
        startVariantRequired: 'La variante de début est requise',
        endDateRequired: 'La date de fin est requise',
        endVariantRequired: 'La variante de fin est requise',
        percentageRequired: 'Le pourcentage est requis',
        percentageInvalid: 'Doit être un nombre valide',
        percentageMin: 'Le pourcentage doit être au moins 0',
        percentageMax: 'Le pourcentage doit être au plus 100',
      },
      Editor: {
        test: 'Tester',
        testDisabledHint: 'Ecrivez une regle pour la tester',
        testTitle: 'Tester cette règle',
        testDescription:
          "Exécute la règle exactement comme une évaluation le ferait, contre le contexte ci-dessous. Rien n'est enregistré.",
        testInstance: 'Instance',
        testInstancePlaceholder: 'Sélectionner une instance (optionnel)',
        testInstanceNone: 'Aucune instance',
        testTargetingKey: 'Clé de ciblage',
        testTargetingKeyPlaceholder: 'slug client, id utilisateur…',
        testContext: 'Contexte additionnel (JSON)',
        testContextPlaceholder: '{ "user": { "cohort": "beta" } }',
        testContextInvalid: "Ce n'est pas du JSON valide",
        testRun: 'Exécuter la règle',
        testMatched: 'A matché',
        testNotMatched: "N'a pas matché",
        testInvalidRule:
          "La règle contient des erreurs et n'a pas été exécutée",
        testEvaluationError:
          "La règle n'a pas pu être évaluée — en production, elle ne matcherait simplement pas",
        testFacts: 'Ce que le serveur a vu (__kaiten)',
      },
    },
    Variants: {
      List: {
        title: 'Variantes',
        description: 'Définissez les valeurs possibles de ce feature flag',
        addButton: 'Ajouter une variante',
        addFirstButton: 'Ajouter une première variante',
        emptyState:
          "Aucune variante pour l'instant. Cliquez sur le bouton ci-dessus pour ajouter votre première variante.",
        duplicateWarning:
          'Noms de variantes en double détectés ! Chaque variante doit avoir un nom unique.',
        lockedVariantTooltip:
          'Cette variante système ne peut pas être supprimée.',
        deleteConfirmTitle: 'Supprimer la variante ?',
        deleteConfirmDescription:
          'Cette action est irréversible. La variante sera définitivement supprimée.',
      },
      Form: {
        name: 'Nom',
        namePlaceholder: 'nom_de_variante',
        description: 'Description',
        descriptionPlaceholder: 'Une courte description de cette variante',
        value: 'Valeur',
        valuePlaceholder: 'Saisir une valeur',
        valueDescription: {
          string: 'Valeur texte',
          number: 'Valeur numérique',
          object: 'Objet JSON',
        },
        Errors: {
          nameRequired: 'Le nom de la variante est requis',
          valueRequired: 'La valeur est requise',
          valueInvalidNumber: 'La valeur doit être un nombre valide',
          valueInvalidJSON: 'La valeur doit être un JSON valide',
        },
      },
    },
    Releases: {
      Table: {
        Columns: {
          name: 'Nom',
          version: 'Version',
          type: 'Type',
          description: 'Description',
          features: 'Features',
          deploymentZones: 'Zones de déploiement',
          currentRelease: 'Release courante',
          createdAt: 'Créé',
          updatedAt: 'Mis à jour',
          status: 'Statut',
          components: 'Components',
          instances: 'Instances',
          component: 'Component',
          releases: 'Releases',
          release: 'Release',
          deploymentZone: 'Zone de déploiement',
          zoneType: 'Type de zone',
          deployedAt: 'Déployé le',
          deployedBy: 'Déployé par',
          metadata: 'Métadonnées',
          extraMetadata: 'Métadonnées hors schema',
        },
        notDeployed: 'Non déployé',
      },
      Stats: {
        totalReleases: 'Total des releases',
        deployed: 'Déployées',
        inStaging: 'En staging',
        superseded: 'Remplacées',
        planned: 'Planifiées',
        totalComponents: 'Total des components',
        active: 'Actifs',
        deprecated: 'Dépréciés',
        totalZones: 'Total des zones',
        productionZones: 'Zones de production',
        totalInstances: 'Total des instances',
        totalDeployments: 'Total des déploiements',
        production: 'Production',
        staging: 'Staging',
        development: 'Développement',
      },
      Form: {
        name: 'Nom',
        version: 'Version',
        type: 'Type',
        description: 'Description',
        descriptionPlaceholder: 'Décrivez cette release...',
        zoneDescriptionPlaceholder: 'Décrivez cette zone de déploiement...',
        slug: 'Slug',
        slugDescription: 'Généré automatiquement — modifiable.',
        zoneSlugPlaceholder: 'production-eu',
        releaseSlugPlaceholder: 'v1-0-0',
        features: 'Features (JSON)',
        featuresHelp: 'Métadonnées au format objet JSON',
        invalidJson: 'Format JSON invalide',
        selectType: 'Choisir ou saisir un type',
        searchType: 'Rechercher ou créer un type',
        typeDescription:
          'Tout type autre que staging ou development compte comme de la production.',
        selectRelease: 'Sélectionner une release',
        selectReleasePlaceholder: 'Choisir une release...',
        deployRelease: 'Déployer la release',
        createRelease: 'Créer une release',
        editRelease: 'Modifier la release',
        SubmitBlockers: {
          title:
            'Vous devez encore corriger les points suivants avant de soumettre :',
          stepTitle: 'Complétez cette étape avant de continuer :',
          submissionInProgress: 'La soumission est déjà en cours.',
          validationInProgress: 'La validation est encore en cours.',
          noChanges: 'Remplissez le formulaire avant de créer la release.',
          creationModeRequired: 'Choisissez comment créer la release.',
          previousReleaseRequired: 'Sélectionnez une release de base.',
          versionRequired: 'La version est requise.',
          reviewForm: 'Vérifiez les champs en surbrillance avant de soumettre.',
        },
        createZone: 'Créer une zone de déploiement',
        editZone: 'Modifier la zone de déploiement',
        deployToZone: 'Déployer une release sur {{zone}}',
        deployVersion: 'Déployer {{version}}',
        deployVersionDescription:
          'Choisissez la zone de déploiement où elle doit tourner.',
        selectZone: 'Zone de déploiement',
        selectZonePlaceholder: 'Choisir une zone de déploiement...',
        zoneAlreadyRuns: 'Cette zone fait déjà tourner {{version}}.',
        noMetadataFieldsTitle: 'Aucun champ de métadonnées déclaré',
        noMetadataFieldsDescription:
          'Déclarez des champs de métadonnées de zone dans les réglages pour les saisir ici, ou modifiez le JSON brut.',
        configureMetadataFields: 'Configurer les champs de métadonnées',
        editAsJson: 'Modifier en JSON',
        metadata: 'Métadonnées',
        metadataHelp: 'Métadonnées au format objet JSON',
        extraMetadataTitle: 'Métadonnées stockées hors schema',
        extraMetadataHint:
          'Ces clés ne sont pas couvertes par un schema actif. Les clés archivées sont préservées à la sauvegarde ; les clés inconnues seront supprimées pour respecter le schema strict.',
      },
      Types: {
        production: 'Production',
        staging: 'Staging',
        development: 'Développement',
      },
      Status: {
        deployed: 'Déployée',
        staging: 'En staging',
        superseded: 'Remplacée',
        planned: 'Planifiée',
      },
      Actions: {
        deploy: 'Déployer',
        edit: 'Modifier',
        delete: 'Supprimer',
      },
      Success: {
        releaseCreated: 'Release créée avec succès',
        releaseUpdated: 'Release mise à jour avec succès',
        releaseDeleted: 'Release supprimée avec succès',
        releaseDeployed: 'Release déployée avec succès',
        zoneCreated: 'Zone de déploiement créée avec succès',
        zoneUpdated: 'Zone de déploiement mise à jour avec succès',
        zoneDeleted: 'Zone de déploiement supprimée avec succès',
      },
      deleteError: 'Échec de la suppression de la release',
      deleteZoneError: 'Échec de la suppression de la zone de déploiement',
      Metadata: {
        title: 'Configuration des métadonnées',
        description:
          'Configuration JSON des métadonnées pour cette zone de déploiement. Cliquez pour voir tous les détails.',
      },
      ExtraMetadata: {
        title: 'Métadonnées hors schema',
        description:
          'Valeurs stockées sur cette zone qui ne sont couvertes par aucun schema de metadata field actif.',
      },
      Dialogs: {
        releaseHistoryTitle: 'Historique des releases',
      },
    },
    DemoSandbox: {
      Banner: {
        warning:
          'Ceci est un environnement de démonstration / bac à sable — les données peuvent être réinitialisées à tout moment.',
        seedButton: 'Générer les données de démonstration',
        seedingProgress: 'Génération des données de démonstration…',
        manageLink: 'Gérer les données de démonstration dans les paramètres',
      },
      Toasts: {
        seedStarted: 'La génération des données de démonstration a démarré.',
        resetStarted:
          'La réinitialisation des données de démonstration a démarré.',
        alreadyRunning:
          'Une génération ou réinitialisation des données de démonstration est déjà en cours.',
      },
    },
  },
} as const;
