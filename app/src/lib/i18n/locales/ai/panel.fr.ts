// AI.Panel (fr). Owned by lot L4 (rule panel); spread into fr.ts.
export default {
  close: 'Fermer',
  discard: {
    title: 'Abandonner vos modifications ?',
    description:
      'La règle en cours de modification a des changements non enregistrés.',
    keep: 'Continuer la modification',
    confirm: 'Abandonner',
  },
  ladder: {
    title: 'Comment cet appel est tarifé',
    label: 'Échelle de résolution, du plus spécifique au plus général',
    noRule: 'Aucune règle',
    creating: 'Règle en cours de création',
    levels: {
      EXACT_TYPED: 'Modèle exact · type de requête exact',
      EXACT_ALL: 'Modèle exact · tout type de requête',
      ANY_TYPED: 'Tout modèle · type de requête exact',
      ANY_ALL: 'Tout modèle · tout type de requête',
    },
    markers: {
      APPLIES: 'S’applique',
      SHADOWED: 'Masquée',
      BLOCKED: 'Ignorée',
      EDITING: 'En modification',
      NEW: 'Nouvelle',
    },
  },
  breakdown: {
    title: 'Appel de référence',
    dimensions: {
      REQUEST: 'par requête',
      INPUT_TOKEN: 'jetons d’entrée',
      CACHE_READ_TOKEN: 'jetons en cache',
      CACHE_WRITE_TOKEN: 'jetons écrits en cache',
      OUTPUT_TOKEN: 'jetons de sortie',
      UNIT: 'unités',
      SECOND: 'secondes',
    },
    inputRate: '(tarif d’entrée)',
    noLine: 'Aucun tarif ne s’applique à cet usage',
    computed: 'Calculé',
    raised: 'Relevé au minimum',
    capped: 'Plafonné au maximum',
    charged: 'Facturé',
    credits: '{{amount}} crédits',
    vendorCost: 'Coût fournisseur (catalogue)',
    unknown: 'inconnu',
    costPerCredit: 'Coût par crédit',
    margin: 'Marge',
    marginAt: 'Marge à {{value}} le crédit',
    setValue: 'définissez la valeur d’un crédit',
    partial:
      'Partiel : le catalogue n’a pas de coût pour une partie de cette consommation ; ni coût par crédit ni marge ne sont donnés.',
  },
  versionArchived:
    'Cette version est archivée. Ses règles tarifent toujours les instances qui l’utilisent.',
  notGranted:
    '{{version}} n’accorde pas {{pool}}. Une règle ici ne tarife que les instances qui reçoivent la réserve autrement.',
  throughAddon:
    '{{version}} n’accorde pas elle-même {{pool}}. Une règle ici tarife les instances qui la détiennent par un add-on.',
  authors: {
    edited: 'Dernière modification par {{name}} · {{date}}',
    created: 'Créée par {{name}} · {{date}}',
    unknown: 'un utilisateur sans nom',
  },
  archived: {
    title: '{{model}} est archivé.',
    body: 'Un modèle archivé n’autorise aucun usage, jokers compris : ses appels sont refusés et ne sont pas facturés. Réactivez-le dans Modèles pour le tarifer.',
    openModels: 'Ouvrir les modèles',
  },
  deprecated: {
    keepsRule:
      'Ce modèle est déprécié. Sa règle reste modifiable ; il n’accepte aucune nouvelle règle.',
    noNewRule:
      'Un modèle déprécié garde ses règles existantes et n’en accepte aucune nouvelle. Réactivez le modèle pour le tarifer ici.',
    noOverride:
      'Un modèle déprécié n’accepte aucune nouvelle règle : il ne peut donc pas avoir de prix propre. Réactivez-le d’abord dans Modèles.',
  },
  inherited: {
    body_one:
      'Tarifé par le joker {{wildcard}} : {{rates}}. Il tarife {{count}} modèle sur cette version aujourd’hui, et tout modèle ajouté ensuite.',
    body_other:
      'Tarifé par le joker {{wildcard}} : {{rates}}. Il tarife {{count}} modèles sur cette version aujourd’hui, et tout modèle ajouté ensuite.',
    override: 'Remplacer pour ce modèle',
    openWildcard: 'Ouvrir le joker',
    help_one:
      'Remplacer ajoute une règle pour {{model}} uniquement. Ouvrir le joker change le prix du modèle qu’il couvre ({{count}}), et des modèles créés ensuite.',
    help_other:
      'Remplacer ajoute une règle pour {{model}} uniquement. Ouvrir le joker change le prix des {{count}} modèles qu’il couvre, et des modèles créés ensuite.',
  },
  none: {
    title: 'Non autorisé.',
    body: 'Aucune règle ne tarife cet appel : il est refusé et enregistré à 0 crédit.',
    flaggedTitle: 'Cette version accorde la réserve et n’a aucune règle.',
    flaggedBody: 'Chaque appel y est refusé et n’est pas facturé.',
    addRule: 'Ajouter une règle pour {{model}}',
    addWildcard: 'Ajouter plutôt un joker',
  },
  exact: {
    addTyped: 'Ajouter une règle pour {{type}} uniquement',
  },
  wildcard: {
    title: 'Joker.',
    editing_one:
      'Le modifier change le prix de {{count}} modèle sur {{version}} qui n’a pas de règle propre, et des modèles créés ensuite.',
    editing_other:
      'Le modifier change le prix de {{count}} modèles sur {{version}} qui n’ont pas de règle propre, et des modèles créés ensuite.',
    creating:
      'Il tarifera chaque modèle sans règle propre sur {{version}}, modèles créés ensuite compris.',
    addOther: 'Ajouter un joker sur l’autre niveau',
    none: 'Aucun joker sur cette version : un modèle sans règle propre est refusé.',
  },
  form: {
    level: 'Niveau de la règle',
    ratesTitle: 'Tarifs en crédits',
    blankHint: 'Vide = non tarifé · 0 = gratuit',
    presetsLabel:
      'Préréglages de tarifs : choisissent les champs affichés, sans saisir de valeur',
    presets: {
      PER_REQUEST: 'Par requête',
      INPUT_OUTPUT: 'Entrée + sortie',
      TOKENS_WITH_CACHE: 'Jetons avec cache',
      PER_UNIT: 'Par unité',
      PER_SECOND: 'Par seconde',
    },
    rates: {
      perRequest: 'Par requête',
      perInputToken: 'Par jeton d’entrée',
      perCachedInputToken: 'Par jeton d’entrée en cache',
      perCacheWriteToken: 'Par jeton écrit en cache',
      perOutputToken: 'Par jeton de sortie',
      perUnit: 'Par unité',
      perSecond: 'Par seconde',
    },
    unpriced: 'non tarifé',
    inheritsInput: 'hérite de l’entrée',
    otherRates_one: 'Autre tarif ({{count}})',
    otherRates_other: 'Autres tarifs ({{count}})',
    limitsTitle: 'Limites et politique d’erreur',
    minimum: 'Minimum par requête',
    maximum: 'Maximum par requête',
    noCap: 'sans plafond',
    chargeOnError: 'Facturation en cas d’erreur',
    policies: {
      NEVER: 'Jamais',
      PROVIDER_ERROR_ONLY: 'Erreurs du fournisseur uniquement',
      ALWAYS: 'Toujours',
    },
    startFromWildcard: 'Partir des tarifs du joker',
    startFromHint: 'Copie ses tarifs et ses limites dans les champs.',
    appliesNext:
      'S’applique dès le prochain commit, réservations ouvertes comprises. Les débits passés ne sont pas recalculés.',
    needsRate: 'Saisissez au moins un tarif.',
    save: 'Enregistrer la règle',
    add: 'Ajouter la règle',
    saved: 'Règle enregistrée',
    created: 'Règle ajoutée',
    errors: {
      rate: 'Un tarif est un nombre, 0 ou plus, avec 10 décimales au plus.',
      bound: 'Une limite est un nombre, 0 ou plus, avec 6 décimales au plus.',
      noRate: 'Saisissez au moins un tarif.',
      maximumBelowMinimum: 'Le maximum doit être au moins égal au minimum.',
    },
  },
  preview: {
    title: 'Aperçu en direct',
    empty:
      'Saisissez un tarif pour voir ce que coûteraient ces appels. Aucun tarif n’est rempli pour vous.',
    call: 'Appel',
    credits: 'Crédits',
    vendor: 'Fournisseur',
    perCredit: '$ / crédit',
    margin: 'Marge',
    model: 'Modèle',
    covered: 'Modèles couverts, sur l’appel de référence',
    future: '+ chaque modèle créé ensuite',
    partial: 'partiel',
    calls: {
      SMALL: 'Petit',
      REFERENCE: 'Référence',
      LARGE: 'Grand',
    },
  },
  archive: {
    action: 'Archiver',
    title: 'Archiver cette règle ?',
    confirm: 'Archiver la règle',
    done: 'Règle archivée',
    fallsBack:
      'Elle cesse de tarifer aussitôt. Les appels de {{model}} sont alors tarifés par le joker {{wildcard}}.',
    fallsBackOwn:
      'Elle cesse de tarifer aussitôt. Les appels de {{model}} sont alors tarifés par sa règle pour tout type de requête.',
    refused:
      'Elle cesse de tarifer aussitôt. Aucune autre règle ne tarife {{model}} sur {{version}} : ses appels seront refusés.',
    wildcard_one:
      'Elle cesse de tarifer aussitôt. Le modèle qu’elle tarife sur {{version}} ({{count}}) est refusé, sauf si une autre règle le tarife.',
    wildcard_other:
      'Elle cesse de tarifer aussitôt. Les {{count}} modèles qu’elle tarife sur {{version}} sont refusés, sauf si une autre règle les tarife.',
  },
} as const;
