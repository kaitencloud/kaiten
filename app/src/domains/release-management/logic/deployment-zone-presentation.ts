// A zone's type is free-form: the API stores whatever it is sent, so an
// organization can class its zones its own way (`shared`, `dedicated`...).
// These three are the classes the console knows: they get a label and a badge
// colour, and the zone form suggests them. Any other type reads as it was typed.
export const ZONE_TYPE_DEFAULTS = [
  'production',
  'staging',
  'development',
] as const;

export type DefaultZoneType = (typeof ZONE_TYPE_DEFAULTS)[number];

const ZONE_TYPE_LABEL_KEYS = {
  production: 'Features.Releases.Types.production',
  staging: 'Features.Releases.Types.staging',
  development: 'Features.Releases.Types.development',
} as const satisfies Record<DefaultZoneType, string>;

export const isDefaultZoneType = (type: string): type is DefaultZoneType =>
  (ZONE_TYPE_DEFAULTS as readonly string[]).includes(type);

export const getZoneTypeBadgeVariant = (type: string) => {
  switch (type) {
    // Production is the important zone, not a dangerous one: the accent,
    // not the colour of errors and deletions.
    case 'production':
      return 'default' as const;
    case 'staging':
      return 'secondary' as const;
    case 'development':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
};

export const formatZoneType = (type: string, t: (key: string) => string) =>
  isDefaultZoneType(type) ? t(ZONE_TYPE_LABEL_KEYS[type]) : type;

// Whether a zone counts as production for release statuses and the production
// counters. staging and development are the pre-production classes; every
// other type -- production itself, and any an organization named for its own,
// like a `shared` or `dedicated` zone -- is where its customers run.
export const countsAsProduction = (type: string) =>
  type !== 'staging' && type !== 'development';

// Distinct types, the three the console knows first and in their own order,
// then the organization's own alphabetically.
export const sortZoneTypes = (types: Iterable<string>): string[] => {
  const distinct = [...new Set(types)];
  return [
    ...ZONE_TYPE_DEFAULTS.filter((type) => distinct.includes(type)),
    ...distinct
      .filter((type) => !isDefaultZoneType(type))
      .sort((left, right) => left.localeCompare(right)),
  ];
};

// What the zone form offers: the three classes, then every type the
// organization already uses, so a zone gets `dedicated` rather than a second
// spelling of it.
export const getZoneTypeSuggestions = (typesInUse: Iterable<string>) =>
  sortZoneTypes([...ZONE_TYPE_DEFAULTS, ...typesInUse]);
