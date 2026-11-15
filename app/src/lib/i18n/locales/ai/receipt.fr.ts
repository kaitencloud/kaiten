// AI.Receipt (fr). Owned by lot L6 (charge receipt); spread into fr.ts.
export default {
  title: 'Reçu de facturation',
  open: 'Reçu',
  openFor: 'Ouvrir le reçu de {{id}}',
  loading: 'Chargement du reçu…',
  notFound:
    'Aucune inférence ne porte l’identifiant de transaction {{id}} sur cette réserve.',
  sections: {
    call: 'Appel',
    priced: 'Comment il a été tarifé',
    notCharged: 'Pourquoi il n’a pas été facturé',
    happened: 'Ce qui s’est passé',
    pool: 'Effet sur la réserve',
    cost: 'Ce qu’il vous a coûté',
    refunds: 'Remboursements',
  },
  headline: {
    outcome: '{{type}} · {{outcome}}',
    noCommit: '{{type}} · sans engagement',
    open: '{{type}} · réservé',
    notAuthorized: 'Non autorisé · {{reason}}',
  },
  call: {
    reportedAt: 'Signalé le',
    committedAt: 'Engagé le',
    modelSent: 'Modèle envoyé',
    resolvedTo: 'Résolu en',
    matchedBySlug: 'trouvé par son slug',
    matchedByExternalId: 'trouvé par un identifiant externe',
    knownSince:
      'le catalogue connaît ce nom aujourd’hui ; il ne le connaissait pas au moment de l’appel',
    notInCatalogue: 'Aucun modèle n’a ce slug ni cet identifiant externe',
    catalogueUnread:
      'non nommé : cette session ne peut pas lire le catalogue des modèles',
    pool: 'Réserve',
    licence: 'Version de licence',
    licenceCurrent:
      'version actuelle ; cette ligne ancienne ne conserve pas la version au moment de l’engagement',
    licenceDeleted: 'cette version de licence n’existe plus',
    usage: 'Consommation',
  },
  priced: {
    rule: 'Règle',
    specificity: {
      EXACT_TYPED: 'Modèle exact · type de requête exact',
      EXACT_ALL: 'Modèle exact · tout type de requête',
      ANY_TYPED: 'Tout modèle · type de requête exact',
      ANY_ALL: 'Tout modèle · tout type de requête',
    },
    snapshot:
      'Tarifs appliqués à l’engagement, lus sur la ligne de l’inférence.',
    snapshotUnchanged:
      'Tarifs appliqués à l’engagement, lus sur la ligne de l’inférence. La règle n’a pas changé depuis.',
    snapshotSameToday:
      'Tarifs appliqués à l’engagement, lus sur la ligne de l’inférence. La règle a été réécrite depuis ; ses tarifs, ses bornes et sa politique d’erreur sont aujourd’hui ceux qui ont été appliqués.',
    snapshotRuleUnread:
      'Tarifs appliqués à l’engagement, lus sur la ligne de l’inférence. Cette session ne peut pas lire les licences : la règle telle qu’elle est aujourd’hui n’a pas été lue, et rien ici ne dit si elle a changé depuis.',
    archivedSince: 'Règle archivée depuis',
    archivedSinceHelp:
      'La règle a été archivée après cet engagement et ne tarife plus rien aujourd’hui. Les tarifs ci-dessous sont ceux qui ont été appliqués.',
    editedSince: 'Règle modifiée depuis',
    editedSinceHelp:
      'La règle a changé depuis cet engagement. Les tarifs ci-dessous sont ceux qui ont été appliqués ; la valeur actuelle figure à côté de chacun de ceux qui ont changé.',
    now: 'aujourd’hui {{value}}',
    nowBlank: 'aujourd’hui non tarifé',
    nowNoMaximum: 'aujourd’hui sans maximum',
    nowMinimum: 'minimum aujourd’hui {{value}}',
    nowMaximum: 'maximum aujourd’hui {{value}}',
    snapshotDisagrees:
      'Recalculer avec ces tarifs ne redonne pas les montants enregistrés. Les montants enregistrés sont ceux facturés à la réserve.',
    matches:
      'Recalculé avec la règle telle qu’elle est aujourd’hui ; le résultat correspond au montant enregistré. Cette ligne ancienne ne conserve pas les tarifs appliqués à l’engagement.',
    inputFallback: 'tarif d’entrée',
    rates: {
      perRequest: 'Par requête',
      perInputToken: 'Par jeton d’entrée',
      perCachedInputToken: 'Par jeton d’entrée en cache',
      perCacheWriteToken: 'Par jeton écrit en cache',
      perOutputToken: 'Par jeton de sortie',
      perUnit: 'Par unité',
      perSecond: 'Par seconde',
    },
    lines: {
      REQUEST: 'par requête',
      INPUT_TOKEN: '{{quantity}} en entrée × {{rate}}',
      CACHE_READ_TOKEN: '{{quantity}} lus en cache × {{rate}}',
      CACHE_WRITE_TOKEN: '{{quantity}} écrits en cache × {{rate}}',
      OUTPUT_TOKEN: '{{quantity}} en sortie × {{rate}}',
      UNIT: '{{quantity}} unités × {{rate}}',
      SECOND: '{{quantity}} s × {{rate}}',
    },
    computed: 'Calculé',
    charged: 'Facturé',
    chargedValue: '{{amount}} crédits',
    bounds: 'Minimum {{minimum}} · maximum {{maximum}}',
    noMaximum: 'aucun',
    within: 'dans les bornes',
    raisedTo: 'relevé à {{amount}}',
    loweredTo: 'abaissé à {{amount}}',
    missingInput:
      'Aucune quantité tarifée n’a été signalée : le minimum s’applique.',
    policy: 'Facturation en cas d’erreur : {{policy}}',
    policies: {
      NEVER: 'Jamais',
      ALWAYS: 'Toujours',
      PROVIDER_ERROR_ONLY: 'Erreurs du fournisseur seulement',
    },
    chargedOutcome: 'facturé',
    notChargedOutcome: 'non facturé',
    reserved: 'Réservé',
    ruleId: 'ID de la règle',
    noRule: 'aucune',
    cannot: {
      intro:
        'Cette ligne ancienne ne conserve pas les tarifs appliqués à l’engagement : ce montant n’est donc pas recalculé ici. Les montants enregistrés font foi.',
      reasons: {
        RULE_EDITED_AFTER_COMMIT:
          'La règle a été modifiée le {{date}}, après cet engagement : ses tarifs actuels peuvent différer de ceux appliqués.',
        RULE_NOT_FOUND:
          'La règle {{id}} est introuvable sur la version de licence {{version}}.',
        RULE_NOT_READ:
          'Cette session ne peut pas lire les licences : la règle {{id}} n’a pas été lue.',
        RULE_NOT_ON_CURRENT_VERSION:
          'La règle {{id}} appartient à la version de licence {{ruleVersion}}, pas à la version actuelle {{version}}.',
        AMOUNT_MISMATCH:
          'Recalculer avec la règle telle qu’elle est aujourd’hui donne d’autres montants que ceux enregistrés.',
        NOT_COMMITTED: 'Rien n’a été calculé : l’appel n’a pas été engagé.',
        NOT_AUTHORIZED: 'Aucune règle n’a tarifé cet appel.',
        NOT_RECOMPUTABLE:
          'Il manque à la ligne ce qu’un recalcul demande : un statut de requête ou des montants enregistrés.',
      },
    },
  },
  denial: {
    NO_RULE:
      'Aucune règle active sur {{version}} pour la réserve {{pool}} ne tarifie {{model}} pour {{type}}, et aucun joker ne le couvre.',
    UNKNOWN_MODEL:
      '{{model}} n’est ni le slug ni un identifiant externe d’un modèle du catalogue : aucune règle n’a pu être cherchée.',
    MODEL_ARCHIVED:
      '{{model}} est archivé. Un modèle archivé n’est jamais tarifé, pas même par un joker.',
    generic: 'L’appel n’a pas été autorisé.',
    knownSince:
      '{{model}} a été ajouté à {{name}} depuis. Les appels envoyés sous ce nom sont désormais résolus vers ce modèle et tarifés par ses règles ; celui-ci reste tel qu’il a été enregistré.',
    recorded: 'L’appel a été enregistré à 0 crédit.',
    fix: {
      NO_RULE:
        'Tarifez ce modèle dans la grille tarifaire, ou ajoutez un joker pour ce type de requête.',
      UNKNOWN_MODEL:
        'Ajoutez {{model}} comme identifiant externe d’un modèle, ou créez le modèle, puis tarifez-le.',
      MODEL_ARCHIVED:
        'Faites appeler un modèle actif par l’intégration, ou restaurez celui-ci dans Modèles.',
    },
  },
  happened: {
    expired:
      'Une réservation de {{amount}} crédits a été prise à {{reportedAt}} et aucun engagement n’est arrivé avant son expiration à {{expiresAt}}. La réservation a été entièrement rendue et rien n’a été facturé. Si l’appel au fournisseur a bien eu lieu, sa consommation n’a pas été signalée.',
    released:
      'L’appel a été libéré sans être envoyé au fournisseur. La réservation a été rendue et rien n’a été facturé.',
    noReservation:
      'Une libération a été signalée pour cet identifiant de transaction, qui ne portait aucune réservation. Rien n’était réservé et rien n’a été facturé ; l’identifiant est clos pour qu’une réservation tardive ne puisse pas retenir de crédits sous ce nom.',
    open: 'Une réservation de {{amount}} crédits est tenue jusqu’au {{expiresAt}}. La facturation est calculée quand l’intégration engage l’appel.',
  },
  pool: {
    reserved: 'Réservé avant l’appel',
    givenBack: {
      COMMITTED: 'Rendu à l’engagement',
      EXPIRED: 'Rendu à l’expiration',
      RELEASED: 'Rendu à la libération',
    },
    drawnAbove: 'Prélevé au-delà de la réservation',
    counterBefore: 'Compteur avant',
    counterAfter: 'Compteur après',
    counterOf: '{{value}} / {{maximum}}',
    reservation: 'Réservation',
    nothingHeld: 'refusée, rien de réservé',
    counter: 'Compteur',
    unchanged: 'inchangé',
    held: 'Réservé jusqu’au',
    refunded: 'Rendu depuis par remboursement',
    reportSeq: 'Séquence dans le journal d’usage',
  },
  refunds: {
    summary: '{{refunded}} crédits remboursés sur {{charged}}.',
    left: 'Il reste {{amount}} crédits à rembourser.',
    nothingLeft: 'Cette facturation est remboursée en totalité.',
    amount: '{{amount}} crédits',
    noReason: 'sans motif',
    by: 'par {{name}}',
    unknownUser: 'un utilisateur sans nom',
    sequence: 'séquence {{sequence}} du journal',
  },
  refund: {
    action: 'Rembourser {{amount}} crédits…',
    title: 'Rembourser des crédits',
    description:
      'Facturation de {{charged}} crédits sur la transaction {{id}}.',
    amount: 'Crédits à rembourser',
    amountHelp:
      'Il reste au plus {{left}} crédits à rembourser sur cette facturation.',
    amountInvalid:
      'Saisissez un nombre de crédits positif, avec six décimales au plus.',
    amountExceeds: 'C’est plus que ce qui reste à rembourser.',
    reason: 'Motif',
    reasonHelp:
      'Facultatif. Conservé avec le remboursement et visible de toute personne qui peut lire cette instance.',
    reasonTooLong: 'Le motif compte 500 caractères au plus.',
    fixAmount: 'Corrigez le montant à rembourser',
    explain:
      'Les crédits reviennent à la réserve {{pool}} dans la fenêtre ouverte en ce moment. La facturation reste enregistrée, avec ce remboursement à côté. Un remboursement ne peut pas être annulé ici.',
    confirm: 'Rembourser',
    success: '{{amount}} crédits remboursés.',
    exceedsLeft:
      'Le remboursement dépasse ce qui reste sur cette facturation : {{left}} crédits.',
    frozenHelp:
      'Verrouillé : ce remboursement a été envoyé et n’a pas encore de réponse.',
    unanswered:
      'Aucune réponse n’est revenue : ce remboursement a peut-être été appliqué. Son montant et son motif sont verrouillés : le renvoyer ne peut pas rembourser deux fois. Si l’échec persiste, rechargez la page et lisez les remboursements de cette facturation avant de rembourser à nouveau.',
    resend: 'Renvoyer le même remboursement',
    earlier:
      'Un remboursement précédent de cette facturation a probablement été appliqué sans que sa réponse parvienne à cette page. Le reçu a été relu : il reste {{left}} crédits à rembourser. Vérifiez les remboursements listés sur le reçu avant de rembourser à nouveau.',
    earlierNothingLeft:
      'Un remboursement précédent de cette facturation a probablement été appliqué : il ne reste rien à rembourser. Vérifiez les remboursements listés sur le reçu.',
    earlierUnread:
      'Un remboursement précédent de cette facturation a probablement été appliqué, et le reçu n’a pas pu être relu. Relisez-le avant de rembourser : ce qu’il reste a pu changer.',
    readAgain: 'Relire le reçu',
  },
  externalId: {
    action: 'Ajouter comme identifiant externe de…',
    title: 'Ajouter comme identifiant externe',
    description:
      'L’intégration a envoyé {{model}}, que le catalogue ne connaît pas.',
    model: 'Modèle du catalogue',
    choose: 'Choisir un modèle',
    search: 'Chercher un modèle',
    empty: 'Aucun modèle ne correspond.',
    suggested: 'Suggéré : son nom commence par le slug de {{name}}.',
    explain:
      '{{model}} devient un identifiant externe du modèle choisi. Les prochains appels envoyés sous ce nom seront résolus vers ce modèle et tarifés par ses règles. Les inférences passées ne sont pas retarifées.',
    confirm: 'Ajouter l’identifiant externe',
    success: '{{model}} est désormais un identifiant externe de {{name}}.',
    createInstead: 'Créer plutôt un modèle',
  },
  cost: {
    vendorComputed: 'Coût fournisseur (catalogue actuel × consommation)',
    vendorStored:
      'Coût fournisseur (calculé à l’engagement d’après le catalogue)',
    vendorReported: 'Coût fournisseur (signalé par l’intégration)',
    notStored: 'non conservé',
    notReported: 'non signalé',
    drift: 'Écart (signalé − calculé)',
    driftAbove: 'l’intégration signale plus que ce que calcule le catalogue',
    driftBelow: 'l’intégration signale moins que ce que calcule le catalogue',
    costPerCreditNote: 'd’après le coût calculé',
    partial:
      'partiel : le catalogue n’a pas de coût pour une partie de la consommation',
    unknown: 'aucun coût au catalogue',
    costPerCredit: 'Coût par crédit',
    margin: 'Marge à {{value}} le crédit',
    marginNote:
      'La valeur du crédit est enregistrée dans ce navigateur, pas sur la réserve.',
    noMargin:
      'Indiquez une valeur de crédit pour cette réserve dans la grille tarifaire pour voir une marge.',
    notCharged: 'non facturé',
    marginAfterRefunds:
      'Sur ce que la facturation a gardé après ses remboursements.',
    refundedInFull: 'remboursée en totalité',
  },
  actions: {
    openRule: 'Ouvrir la règle',
    priceIt: 'Le tarifer',
    openModel: 'Ouvrir le modèle',
    openModels: 'Ouvrir les modèles',
  },
  raw: {
    show: 'Enregistrement brut',
    description: 'La ligne telle que l’API la renvoie, pour le support.',
  },
  warnings: {
    title: 'Avertissements',
    help: {
      NO_RESERVATION:
        'La transaction ne portait aucune réservation quand ceci a été signalé.',
      COUNTER_PRECISION_DEGRADED:
        'Le compteur de la réserve est trop grand pour porter exactement cette facturation. Le montant de ce reçu est exact ; le compteur est arrondi.',
      PRICING_SNAPSHOT_UNREADABLE:
        'Les tarifs conservés avec cet engagement n’ont pas pu être lus : ils ne sont pas affichés. Les montants enregistrés sont ceux qui ont été facturés.',
      MODEL_DEPRECATED:
        'Le modèle est obsolète. Il reste tarifé ; faites appeler son remplaçant par l’intégration.',
      CONVERSION_INPUT_MISSING:
        'L’appel n’a signalé aucune quantité que la règle tarife : le minimum de la règle a été calculé.',
      OVERDRAWN:
        'L’appel a été compté bien qu’il ait porté la réserve au-delà de son maximum.',
    },
    NO_RESERVATION: 'Sans réservation',
    PRICING_SNAPSHOT_UNREADABLE: 'Tarifs conservés illisibles',
    COUNTER_PRECISION_DEGRADED: 'Précision du compteur dégradée',
    MODEL_DEPRECATED: 'Modèle obsolète',
    ESTIMATE_INCOMPLETE: 'Estimation incomplète',
    RESERVATION_EXPIRED: 'Réservation expirée',
    MODEL_NOT_AUTHORIZED: 'Modèle non autorisé',
    UNKNOWN_MODEL: 'Modèle inconnu',
    CONVERSION_INPUT_MISSING: 'Aucune quantité tarifée signalée',
    OVERDRAWN: 'À découvert',
  },
} as const;
