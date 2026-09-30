const FEATURE_LOCAL_MODULES = new Set([
  'feature-flags/rollout',
  'feature-flags/targeting',
  'feature-flags/variants',
]);

export type ArchitectureRule =
  | 'component-boundary'
  | 'cross-feature'
  | 'domain-boundary'
  | 'feature-local-module'
  | 'feature-root-barrel'
  | 'feature-route-boundary'
  | 'functional-boundary'
  | 'functional-public-api'
  | 'hook-boundary'
  | 'internal-relative-import'
  | 'lib-boundary'
  | 'module-public-api';

export type ArchitectureSeverity = 'error' | 'warning';

export type ArchitectureViolation = {
  filePath: string;
  line: number;
  message: string;
  rule: ArchitectureRule;
  severity: ArchitectureSeverity;
  target: string;
};

type AddViolation = (
  rule: ArchitectureRule,
  message: string,
  severity?: ArchitectureSeverity,
) => void;

export type ImportReference = {
  line: number;
  specifier: string;
};

export type ModuleLocation = {
  layer: string;
  parts: string[];
  scope?: string;
};

type ReferenceCheckContext = {
  reference: ImportReference;
  sourceLocation: ModuleLocation;
  sourcePath: string;
  srcDir: string;
  targetLocation: ModuleLocation;
  targetPath: string;
};

export function checkReference(
  context: ReferenceCheckContext,
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const {
    reference,
    sourceLocation,
    sourcePath,
    srcDir,
    targetLocation,
    targetPath,
  } = context;

  const addViolation: AddViolation = (rule, message, severity = 'error') => {
    violations.push({
      filePath: formatRelativePath(srcDir, sourcePath),
      line: reference.line,
      message,
      rule,
      severity,
      target: formatRelativePath(srcDir, targetPath),
    });
  };

  checkLayerBoundaries(sourceLocation, targetLocation, addViolation);
  checkFeatureBoundaries(sourceLocation, targetLocation, addViolation);
  checkFunctionalPublicApi(
    reference.specifier,
    sourceLocation,
    targetLocation,
    addViolation,
  );

  // Encapsulation rules (warnings, not blocking in CI): only evaluated when no
  // hard boundary rule has already flagged this import, to avoid reporting it
  // twice.
  if (violations.length === 0) {
    checkInternalRelativeImport(
      reference.specifier,
      sourceLocation,
      targetLocation,
      addViolation,
    );
    checkModulePublicApi(
      reference.specifier,
      sourceLocation,
      targetLocation,
      addViolation,
    );
  }

  return violations;
}

function checkLayerBoundaries(
  source: ModuleLocation,
  target: ModuleLocation,
  addViolation: (rule: ArchitectureRule, message: string) => void,
) {
  if (
    source.layer === 'components' &&
    ['api-client', 'domains', 'features', 'functionals', 'routes'].includes(
      target.layer,
    )
  ) {
    addViolation(
      'component-boundary',
      '`components` cannot depend on a business or orchestration layer.',
    );
  }

  if (
    source.layer === 'functionals' &&
    ['api-client', 'domains', 'features', 'routes'].includes(target.layer)
  ) {
    addViolation(
      'functional-boundary',
      '`functionals` cannot depend on business code, routes or the API client.',
    );
  }

  if (
    source.layer === 'domains' &&
    ['features', 'routes'].includes(target.layer)
  ) {
    addViolation(
      'domain-boundary',
      '`domains` cannot depend on a feature or a route.',
    );
  }

  if (
    source.layer === 'hooks' &&
    ['api-client', 'domains', 'features', 'functionals', 'routes'].includes(
      target.layer,
    )
  ) {
    addViolation(
      'hook-boundary',
      '`hooks` cannot depend on business code, functionals, routes or the API client.',
    );
  }

  if (
    source.layer === 'lib' &&
    [
      'components',
      'domains',
      'features',
      'functionals',
      'hooks',
      'routes',
    ].includes(target.layer)
  ) {
    addViolation(
      'lib-boundary',
      '`lib` is the lowest layer: it cannot import components, hooks, functionals, domains, features or routes.',
    );
  }
}

function checkFeatureBoundaries(
  source: ModuleLocation,
  target: ModuleLocation,
  addViolation: (rule: ArchitectureRule, message: string) => void,
) {
  if (
    source.layer === 'features' &&
    target.layer === 'features' &&
    source.scope !== target.scope
  ) {
    addViolation(
      'cross-feature',
      'A feature cannot import another feature, not even for a type.',
    );
  }

  if (
    target.layer === 'features' &&
    isFeatureRootIndex(target.parts) &&
    source.layer !== 'routes'
  ) {
    addViolation(
      'feature-root-barrel',
      'A feature root barrel is reserved for routes.',
    );
  }

  if (source.layer === 'features' && target.layer === 'routes') {
    addViolation(
      'feature-route-boundary',
      'A feature cannot import from `routes`: routes assemble features, never the other way round.',
    );
  }

  const localModule = target.parts.slice(1, 3).join('/');
  if (
    target.layer === 'features' &&
    FEATURE_LOCAL_MODULES.has(localModule) &&
    !(source.layer === 'features' && source.scope === target.scope)
  ) {
    addViolation(
      'feature-local-module',
      'This feature-flags submodule is private to its feature.',
    );
  }
}

function checkFunctionalPublicApi(
  specifier: string,
  source: ModuleLocation,
  target: ModuleLocation,
  addViolation: (rule: ArchitectureRule, message: string) => void,
) {
  if (target.layer !== 'functionals' || !target.scope) {
    return;
  }

  if (source.layer === 'functionals' && source.scope === target.scope) {
    return;
  }

  if (specifier !== `@/functionals/${target.scope}`) {
    addViolation(
      'functional-public-api',
      `The "${target.scope}" functional must be imported through its public API.`,
    );
  }
}

const MODULE_LAYERS = new Set(['features', 'functionals', 'domains']);
const PUBLIC_API_LAYERS = new Set(['domains', 'features']);

// A file must not import its OWN module through the absolute `@/` alias:
// internal imports stay relative so the folder can move without breaking.
function checkInternalRelativeImport(
  specifier: string,
  source: ModuleLocation,
  target: ModuleLocation,
  addViolation: AddViolation,
) {
  if (!source.scope || !MODULE_LAYERS.has(source.layer)) {
    return;
  }

  if (source.layer !== target.layer || source.scope !== target.scope) {
    return;
  }

  if (specifier.startsWith('@/')) {
    addViolation(
      'internal-relative-import',
      'Import within the same module: use a relative path so the folder stays movable.',
      'warning',
    );
  }
}

// From outside a module (feature or domain), only its public index
// (`@/<layer>/<scope>`) may be imported, never its internal files. Functionals
// are already covered by `functional-public-api` (an error).
function checkModulePublicApi(
  specifier: string,
  source: ModuleLocation,
  target: ModuleLocation,
  addViolation: AddViolation,
) {
  if (!target.scope || !PUBLIC_API_LAYERS.has(target.layer)) {
    return;
  }

  if (source.layer === target.layer && source.scope === target.scope) {
    return;
  }

  if (specifier.startsWith(`@/${target.layer}/${target.scope}/`)) {
    addViolation(
      'module-public-api',
      `The "${target.layer}/${target.scope}" module must be imported through its public index (@/${target.layer}/${target.scope}).`,
      'warning',
    );
  }
}

function isFeatureRootIndex(parts: string[]) {
  return (
    parts.length === 3 &&
    parts[0] === 'features' &&
    /^index\.[cm]?[jt]sx?$/.test(parts[2])
  );
}

function formatRelativePath(srcDir: string, filePath: string) {
  const relativePath = filePath.slice(srcDir.length + 1);
  return relativePath.replaceAll('\\', '/');
}
