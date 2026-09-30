// Response shapes for GET /api/demo/status and POST /api/demo/seed. A hosted
// layer answers those paths behind the shared /api origin; they are absent from
// kaiten's own OpenAPI document, which is why these are hand-written rather
// than generated. A deployment that does not serve them leaves the feature off
// (see lib/feature-flags: every platform flag is false with no metering
// deployment configured).

export interface DemoStatus {
  is_demo: boolean;
  seeded: boolean;
  seeding: boolean;
}

export interface DemoSeedResult {
  status: string;
}

export interface DemoResetResult {
  status: string;
}
