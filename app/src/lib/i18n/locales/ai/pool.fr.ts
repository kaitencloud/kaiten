// AI.Pool (fr). Owned by lot L7 (entitlement pricing tab); spread into fr.ts.
export default {
  pricingTab: 'Tarification',
  typeLabel: 'Crédits IA · Droit calculé',
  setPrices: 'Définir les prix',
  intro:
    'Les règles se modifient dans IA › Tarification, la grille tarifaire, où les versions d’une famille sont côte à côte. Cet onglet résume ce que facture chaque version.',
  openRateCard: 'Ouvrir dans la grille',
  openVersionInRateCard: 'Ouvrir {{version}} dans la grille tarifaire',
  tableLabel: 'Tarifs de cette réserve par version de licence',
  loading: 'Chargement de la grille tarifaire…',
  columns: {
    version: 'Version de licence',
    grant: 'Allocation par fenêtre',
    rules: 'Règles',
    models: 'Modèles tarifés',
    wildcard: 'Générique',
    costPerCredit: 'Coût par crédit',
    actions: 'Actions',
  },
  grant: {
    notGranted: 'Non accordé',
    unlimited: 'Illimité',
    hardLimit: 'limite stricte',
    overage: '+{{percent}} % → {{maximum}}',
  },
  noRule: 'Aucune règle · appels refusés',
  noRuleHelp:
    'Cette version accorde la réserve mais aucune règle ne tarifie de modèle.',
  pricedNotGranted: 'Tarifé, non accordé',
  pricedNotGrantedHelp:
    'Ses règles ne s’appliquent qu’aux instances qui reçoivent la réserve d’un add-on ou d’un boost.',
  pricedNotGrantedFootnote:
    'Tarifé, non accordé : les règles de ces versions ne s’appliquent qu’aux instances qui reçoivent la réserve d’un add-on ou d’un boost.',
  wildcardChip: 'Tout modèle · {{type}}',
  anyType: 'tout type',
  costRange: '{{cheapest}} – {{dearest}}',
  costModels: '{{cheapest}} → {{dearest}}',
  notAvailable: 'Non disponible',
  costPartial_one:
    '{{count}} modèle écarté : le catalogue ne chiffre qu’une partie de son appel de référence.',
  costPartial_other:
    '{{count}} modèles écartés : le catalogue ne chiffre qu’une partie de leur appel de référence.',
  footnote:
    'Le coût par crédit est le coût fournisseur de l’appel de référence de chaque modèle divisé par les crédits facturés pour cet appel sur cette version. Les versions archivées sont estompées : elles tarifent encore les instances qui les utilisent.',
  emptyTitle: 'Aucune version de licence n’accorde ni ne tarifie cette réserve',
  emptyBody:
    'Aucune instance ne peut encore le consommer. Accordez-le sur une version de licence, puis fixez ses tarifs dans la grille tarifaire.',
  openLicences: 'Ouvrir les licences',
  addons: {
    through: 'Par un add-on',
    throughNamed: 'Par un add-on · {{names}}',
    alsoThrough: '+ add-on',
    details: 'Add-ons qui peuvent accorder cette réserve sur {{version}}',
    title: 'Add-ons qui peuvent accorder cette réserve',
    explain:
      'Une version d’add-on compatible avec cette famille de licences peut accorder {{pool}} à une instance sur n’importe laquelle de ses versions. Cela ne veut pas dire que chaque instance la détient : un add-on se rattache à une instance, une par une.',
    loading: 'Lecture des add-ons…',
    none: 'Aucune version d’add-on n’accorde cette réserve sur cette famille.',
    version: 'v{{version}}',
    default: 'Version par défaut',
    unlimited: 'Illimité',
    perUnit: '{{amount}} crédits par unité',
    maxQuantity: 'jusqu’à {{count}} par instance',
    lifecycle: {
      DRAFT: 'Brouillon',
      PUBLISHED: 'Publiée',
      ARCHIVED: 'Archivée',
    },
    lifecycleHelp: {
      DRAFT: 'Rattachable seulement à une instance sans abonnement en cours.',
      ARCHIVED:
        'Plus de nouveau rattachement ; les instances qui la détiennent la gardent, avec ce qu’elle accorde.',
    },
    behavior: {
      ADD: 's’ajoute à ce que la licence accorde',
      OVERRIDE: 'remplace ce que la licence accorde',
      MAX: 'le plus grand des deux s’applique',
    },
    unreadable: {
      BILLING_OFF:
        'La facturation est désactivée sur ce déploiement : les add-ons ne peuvent pas être listés ici.',
      NO_SCOPE:
        'Cette session ne peut pas lire les add-ons (read:addons) : ils ne sont pas listés ici.',
      ERROR: 'Les add-ons n’ont pas pu être lus.',
    },
  },
  typeHelp: 'Le type de droit (Booléen, Nombre, Config ou Crédits)',
  unitSingular: 'crédit',
  unitPlural: 'crédits',
} as const;
