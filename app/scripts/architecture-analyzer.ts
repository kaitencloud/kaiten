import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { parseSync, Visitor } from 'oxc-parser';
import {
  checkReference,
  type ArchitectureViolation,
  type ImportReference,
  type ModuleLocation,
} from './architecture-rules';

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const RESOLUTION_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.mts',
  '/index.cts',
] as const;

export type ArchitectureSource = {
  content: string;
  filePath: string;
};

export function analyzeArchitecture(
  srcDir: string,
  sources: readonly ArchitectureSource[],
): ArchitectureViolation[] {
  const normalizedSrcDir = resolve(srcDir);
  const sourcePaths = new Set(
    sources.map((source) => resolve(source.filePath)),
  );
  const violations: ArchitectureViolation[] = [];

  for (const source of sources) {
    const sourcePath = resolve(source.filePath);
    const sourceLocation = getModuleLocation(normalizedSrcDir, sourcePath);
    const references = collectImportReferences(sourcePath, source.content);

    for (const reference of references) {
      const targetPath = resolveImportPath(
        normalizedSrcDir,
        sourcePath,
        reference.specifier,
        sourcePaths,
      );

      if (!targetPath) {
        continue;
      }

      violations.push(
        ...checkReference({
          reference,
          sourceLocation,
          sourcePath,
          srcDir: normalizedSrcDir,
          targetLocation: getModuleLocation(normalizedSrcDir, targetPath),
          targetPath,
        }),
      );
    }
  }

  return violations.sort(compareViolations);
}

export function loadArchitectureSources(srcDir: string): ArchitectureSource[] {
  return collectSourceFiles(resolve(srcDir)).map((filePath) => ({
    content: readFileSync(filePath, 'utf8'),
    filePath,
  }));
}

function collectImportReferences(
  filePath: string,
  content: string,
): ImportReference[] {
  const lineStarts = computeLineStarts(content);
  const references: ImportReference[] = [];

  function addReference(start: number, specifierValue: string) {
    references.push({
      line: lineForPosition(lineStarts, start) + 1,
      specifier: specifierValue,
    });
  }

  const { program } = parseSync(filePath, content, {
    lang: getParserLang(filePath),
  });

  new Visitor({
    ImportDeclaration(node) {
      addReference(node.start, node.source.value);
    },
    ExportNamedDeclaration(node) {
      if (node.source) {
        addReference(node.start, node.source.value);
      }
    },
    ExportAllDeclaration(node) {
      addReference(node.start, node.source.value);
    },
    TSImportEqualsDeclaration(node) {
      if (node.moduleReference.type === 'TSExternalModuleReference') {
        addReference(node.start, node.moduleReference.expression.value);
      }
    },
    ImportExpression(node) {
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        addReference(node.start, node.source.value);
      }
    },
    TSImportType(node) {
      addReference(node.start, node.source.value);
    },
  }).visit(program);

  return references;
}

function computeLineStarts(text: string): number[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function lineForPosition(lineStarts: readonly number[], position: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= position) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

function resolveImportPath(
  srcDir: string,
  sourcePath: string,
  specifier: string,
  sourcePaths: ReadonlySet<string>,
): string | null {
  let basePath: string;

  if (specifier.startsWith('@/')) {
    basePath = resolve(srcDir, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    basePath = resolve(dirname(sourcePath), specifier);
  } else {
    return null;
  }

  for (const suffix of RESOLUTION_EXTENSIONS) {
    const candidate = resolve(`${basePath}${suffix}`);
    if (
      sourcePaths.has(candidate) ||
      (existsSync(candidate) && statSync(candidate).isFile())
    ) {
      return candidate;
    }
  }

  return resolve(basePath);
}

function getModuleLocation(srcDir: string, filePath: string): ModuleLocation {
  const relativePath = relative(srcDir, filePath);
  const parts = relativePath.split(sep);

  if (relativePath.startsWith('..') || parts.length === 0) {
    return { layer: 'other', parts };
  }

  return {
    layer: parts[0],
    parts,
    scope: parts[1],
  };
}

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(extname(entry.name)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function getParserLang(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.js') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs'))
    return 'js';
  return 'ts';
}

function compareViolations(
  left: ArchitectureViolation,
  right: ArchitectureViolation,
) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.rule.localeCompare(right.rule)
  );
}
