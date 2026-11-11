// AI.Models (fr). Owned by lot L9 (models); spread into fr.ts.
export default {
  identity: 'Identité',
  provider: 'Détails fournisseur',
  slugHelp: 'Utilisez des lettres minuscules, chiffres et tirets.',
  slugLocked: 'L’identifiant ne peut plus changer après la création.',
  modalityLocked: 'La modalité ne peut plus changer après la création.',
  description:
    'Modèles que vos licences peuvent autoriser via les règles de conversion des crédits.',
  search: 'Rechercher des modèles',
  searchPlaceholder: 'Nom, identifiant, fournisseur, modalité ou état',
  count: '{{count}} modèles sur {{total}}',
  empty: 'Aucun modèle. Créez-en un pour configurer les tarifs en crédits.',
  noMatches:
    'Aucun modèle ne correspond. Essayez un autre nom, fournisseur ou état.',
  loading: 'Chargement du catalogue de modèles…',
  vendorCost: 'Coût fournisseur',
  rules: 'Règles',
  allStatuses: 'Tous les états',
  cost: {
    tokens: '{{input}} $ en entrée · {{output}} $ en sortie / 1 M de jetons',
    inputOnly: '{{input}} $ / 1 M de jetons d’entrée',
    outputOnly: '{{output}} $ / 1 M de jetons de sortie',
    unit: '{{unit}} $ / unité',
    none: 'Non renseigné',
  },
  rulesCount_zero: 'Aucune règle',
  rulesCount_one: '{{count}} règle',
  rulesCount_other: '{{count}} règles',
  rulesLink_zero:
    'Ouvrir la grille tarifaire sur {{model}} : aucune règle ne le nomme',
  rulesLink_one:
    'Ouvrir la grille tarifaire sur {{model}} : {{count}} règle le nomme',
  rulesLink_other:
    'Ouvrir la grille tarifaire sur {{model}} : {{count}} règles le nomment',
  deleteModel: 'Supprimer {{model}}',
  removal: {
    inUseTitle: '{{model}} ne peut pas être supprimé',
    inUse_one:
      '{{count}} règle nomme ce modèle. Un modèle qu’une règle référence ne peut pas être supprimé.',
    inUse_other:
      '{{count}} règles nomment ce modèle. Un modèle qu’une règle référence ne peut pas être supprimé.',
    refused:
      'L’API a refusé la suppression : une règle de conversion référence ce modèle, peut-être une règle archivée que la grille tarifaire ne liste pas.',
    archiveInstead:
      'Archivez-le plutôt : un modèle archivé n’autorise aucun usage, jokers compris, donc chaque appel qui le vise est refusé. Ses règles restent en place, et son statut peut être rétabli dans son formulaire.',
    alreadyArchived:
      'Il est déjà archivé : il n’autorise aucun usage. Il pourra être supprimé quand plus aucune règle ne le référencera.',
    archive: 'Archiver le modèle',
    openRules: 'Ouvrir ses règles',
    archived: '{{model}} est archivé.',
    deleted: '{{model}} est supprimé.',
  },
  title: 'Modèles',
  create: 'Créer un modèle',
  edit: 'Modifier le modèle',
  externalIds: 'Identifiants fournisseur (un par ligne)',
  modelImpact:
    'L’état du modèle est partagé entre les droits. Les changements affectent les validations en cours ; une réservation ne fige ni l’éligibilité ni le tarif.',
  lifecycle:
    'Actif accepte de nouvelles règles. Déprécié conserve les règles existantes mais refuse les nouvelles. Archivé n’autorise aucun usage, même générique. L’état est réversible.',
  openRouterUnreachable:
    'Ce navigateur n’a pas pu joindre le catalogue d’OpenRouter.',
  openRouterUnreachableHelp:
    'L’import lit le catalogue directement sur openrouter.ai depuis votre navigateur. Il faut un accès sortant vers openrouter.ai : une politique de sécurité du contenu (CSP), l’absence de réseau ou une installation isolée le bloquent. Créez plutôt le modèle à la main.',
  wildcardRow: '{{version}} ({{slug}}) · {{pool}} · {{requestType}}',
  wildcardNone:
    'Aucune règle « tout modèle » ne tarifie aujourd’hui un modèle de cette modalité.',
} as const;
