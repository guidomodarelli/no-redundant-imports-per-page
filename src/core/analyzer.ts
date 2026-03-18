import fs from 'node:fs';
import path from 'node:path';

import { clearAnalysisCache, getCacheKey, getCachedAnalysis, setCachedAnalysis } from './cache';
import { discoverPageEntryStyles } from './discovery';
import { parseStyleFile } from './parser';
import { canonicalizeFilePath, resolveStyleImport } from './resolver';
import type {
  AnalysisState,
  Diagnostic,
  ImportOccurrence,
  NormalizedRuleOptions,
  RuleOptions,
  StyleFileInfo,
} from './types';

interface RootPageImportContext {
  rootPageImporterFile: string;
  rootPageImportText: string;
  rootPageImportLoc: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
}

export const DEFAULT_RULE_OPTIONS: Omit<NormalizedRuleOptions, 'aliases'> = {
  pageDirNames: ['pages', 'nordic-pages'],
  pageStyleNames: ['styles', 'index'],
  styleExtensions: ['.scss', '.sass', '.css'],
  pageModuleNames: ['index', 'view'],
  includeNodeModules: true,
  mode: 'simple',
  nodeModulesDepth: 0,
  reportNodeModulesInPage: true,
  analyzeConditionalImports: false,
};

const loadPackageModuleAliases = (cwd: string): Record<string, string> => {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      _moduleAliases?: Record<string, unknown>;
    };

    return Object.fromEntries(
      Object.entries(packageJson._moduleAliases ?? {}).flatMap(([alias, aliasTarget]) =>
        typeof aliasTarget === 'string'
          ? [[alias, path.resolve(cwd, aliasTarget)]]
          : [],
      ),
    );
  } catch {
    return {};
  }
};

export const normalizeRuleOptions = (
  cwd: string,
  ruleOptions: RuleOptions | undefined,
): NormalizedRuleOptions => ({
  pageDirNames: ruleOptions?.pageDirNames ?? DEFAULT_RULE_OPTIONS.pageDirNames,
  pageStyleNames: ruleOptions?.pageStyleNames ?? DEFAULT_RULE_OPTIONS.pageStyleNames,
  styleExtensions: ruleOptions?.styleExtensions ?? DEFAULT_RULE_OPTIONS.styleExtensions,
  pageModuleNames: ruleOptions?.pageModuleNames ?? DEFAULT_RULE_OPTIONS.pageModuleNames,
  aliases: {
    '@root': path.resolve(cwd),
    ...loadPackageModuleAliases(cwd),
    ...(ruleOptions?.aliases ?? {}),
  },
  includeNodeModules: ruleOptions?.includeNodeModules ?? DEFAULT_RULE_OPTIONS.includeNodeModules,
  mode: ruleOptions?.mode ?? DEFAULT_RULE_OPTIONS.mode,
  nodeModulesDepth: ruleOptions?.nodeModulesDepth ?? DEFAULT_RULE_OPTIONS.nodeModulesDepth,
  reportNodeModulesInPage:
    ruleOptions?.reportNodeModulesInPage ?? DEFAULT_RULE_OPTIONS.reportNodeModulesInPage,
  analyzeConditionalImports:
    ruleOptions?.analyzeConditionalImports ?? DEFAULT_RULE_OPTIONS.analyzeConditionalImports,
});

const isNodeModulesFile = (filePath: string): boolean =>
  filePath.split(path.posix.sep).includes('node_modules');

const getNextNodeModulesDepth = (
  currentFile: string,
  resolvedFile: string,
  currentNodeModulesDepth: number | null,
): number | null => {
  if (!isNodeModulesFile(resolvedFile)) {
    return null;
  }

  if (!isNodeModulesFile(currentFile)) {
    return 0;
  }

  return (currentNodeModulesDepth ?? 0) + 1;
};

const shouldAnalyzeResolvedImport = (
  currentFile: string,
  resolvedFile: string,
  currentNodeModulesDepth: number | null,
  options: NormalizedRuleOptions,
): boolean => {
  if (!isNodeModulesFile(resolvedFile)) {
    return true;
  }

  if (options.mode === 'advanced') {
    return true;
  }

  const nextNodeModulesDepth = getNextNodeModulesDepth(
    currentFile,
    resolvedFile,
    currentNodeModulesDepth,
  );

  return nextNodeModulesDepth !== null && nextNodeModulesDepth <= options.nodeModulesDepth;
};

const getStyleFileInfo = (filePath: string, analysisState: AnalysisState): StyleFileInfo => {
  const canonicalFilePath = canonicalizeFilePath(filePath);
  const cachedStyleFile = analysisState.parseCache.get(canonicalFilePath);

  if (cachedStyleFile) {
    return cachedStyleFile;
  }

  const parsedStyleFile = parseStyleFile(canonicalFilePath);
  analysisState.parseCache.set(canonicalFilePath, parsedStyleFile);
  return parsedStyleFile;
};

const pushDiagnostic = (analysisState: AnalysisState, diagnostic: Diagnostic): void => {
  const existingDiagnostics = analysisState.diagnosticsByFile.get(diagnostic.file) ?? [];
  existingDiagnostics.push(diagnostic);
  analysisState.diagnosticsByFile.set(diagnostic.file, existingDiagnostics);
};

const indexStylesheetEntryPoint = (
  stylesheetFile: string,
  entryFile: string,
  analysisState: AnalysisState,
): void => {
  const indexedEntries = analysisState.entryFilesByStylesheet.get(stylesheetFile) ?? new Set<string>();
  indexedEntries.add(entryFile);
  analysisState.entryFilesByStylesheet.set(stylesheetFile, indexedEntries);
};

const indexEntryPointReachability = (
  entryFile: string,
  cwd: string,
  options: NormalizedRuleOptions,
  analysisState: AnalysisState,
): void => {
  const visited = new Set<string>();

  const walk = (currentFile: string, currentNodeModulesDepth: number | null): void => {
    if (visited.has(currentFile)) {
      return;
    }

    visited.add(currentFile);
    indexStylesheetEntryPoint(currentFile, entryFile, analysisState);

    const styleFileInfo = getStyleFileInfo(currentFile, analysisState);

    for (const importEdge of styleFileInfo.imports) {
      if (importEdge.isUrlLike) {
        continue;
      }

      if (importEdge.conditional && !options.analyzeConditionalImports) {
        continue;
      }

      if (!importEdge.specifier) {
        continue;
      }

      const resolvedFile = resolveStyleImport(
        currentFile,
        importEdge.specifier,
        cwd,
        options,
        analysisState,
      );

      if (!resolvedFile) {
        continue;
      }

      if (!shouldAnalyzeResolvedImport(currentFile, resolvedFile, currentNodeModulesDepth, options)) {
        continue;
      }

      walk(
        resolvedFile,
        getNextNodeModulesDepth(currentFile, resolvedFile, currentNodeModulesDepth),
      );
    }
  };

  walk(entryFile, null);
};

const analyzeEntryPoint = (
  entryFile: string,
  cwd: string,
  options: NormalizedRuleOptions,
  analysisState: AnalysisState,
): void => {
  if (analysisState.analyzedEntries.has(entryFile)) {
    return;
  }

  const firstSeen = new Map<string, ImportOccurrence>();
  const activeStack = new Set<string>();

  const walk = (
    currentFile: string,
    rootPageImportContext: RootPageImportContext | null,
    currentNodeModulesDepth: number | null,
  ): void => {
    const styleFileInfo = getStyleFileInfo(currentFile, analysisState);
    activeStack.add(currentFile);

    for (const importEdge of styleFileInfo.imports) {
      if (importEdge.isUrlLike) {
        continue;
      }

      if (importEdge.conditional && !options.analyzeConditionalImports) {
        continue;
      }

      if (!importEdge.specifier) {
        continue;
      }

      const resolvedFile = resolveStyleImport(
        currentFile,
        importEdge.specifier,
        cwd,
        options,
        analysisState,
      );

      if (!resolvedFile) {
        continue;
      }

      if (!shouldAnalyzeResolvedImport(currentFile, resolvedFile, currentNodeModulesDepth, options)) {
        continue;
      }

      const currentRootPageImportContext = rootPageImportContext ?? {
        rootPageImporterFile: entryFile,
        rootPageImportText: importEdge.importText,
        rootPageImportLoc: importEdge.loc,
      };

      const currentOccurrence: ImportOccurrence = {
        importerFile: currentFile,
        importText: importEdge.importText,
        resolvedFile,
        loc: importEdge.loc,
        ...currentRootPageImportContext,
      };

      const firstOccurrence = firstSeen.get(resolvedFile);

      if (firstOccurrence) {
        pushDiagnostic(analysisState, {
          kind: 'local',
          file: currentFile,
          loc: importEdge.loc,
          entryFile,
          importText: importEdge.importText,
          resolvedFile,
          redundantImporterFile: currentFile,
          firstSeen: firstOccurrence,
          cycle: activeStack.has(resolvedFile),
        });

        if (
          currentFile !== entryFile
          && (!isNodeModulesFile(resolvedFile) || options.reportNodeModulesInPage)
        ) {
          pushDiagnostic(analysisState, {
            kind: 'pageAggregate',
            file: entryFile,
            loc: currentOccurrence.rootPageImportLoc,
            entryFile,
            importText: importEdge.importText,
            resolvedFile,
            redundantImporterFile: currentFile,
            firstSeen: firstOccurrence,
            cycle: activeStack.has(resolvedFile),
          });
        }

        continue;
      }

      firstSeen.set(resolvedFile, currentOccurrence);
      walk(
        resolvedFile,
        currentRootPageImportContext,
        getNextNodeModulesDepth(currentFile, resolvedFile, currentNodeModulesDepth),
      );
    }

    activeStack.delete(currentFile);
  };

  firstSeen.set(entryFile, {
    importerFile: entryFile,
    importText: '<entry>',
    resolvedFile: entryFile,
    loc: {
      line: 1,
      column: 1,
    },
    rootPageImporterFile: entryFile,
    rootPageImportText: '<entry>',
    rootPageImportLoc: {
      line: 1,
      column: 1,
    },
  });

  walk(entryFile, null, null);
  analysisState.analyzedEntries.add(entryFile);
};

const createEmptyAnalysisState = (): AnalysisState => ({
  entryFiles: [],
  entryFilesByStylesheet: new Map<string, Set<string>>(),
  analyzedEntries: new Set<string>(),
  diagnosticsByFile: new Map<string, Diagnostic[]>(),
  parseCache: new Map<string, StyleFileInfo>(),
  resolveCache: new Map<string, string | null>(),
  targetPathResolveCache: new Map<string, string | null>(),
});

export const analyzeWorkspace = (
  cwd: string,
  ruleOptions: RuleOptions | undefined,
): AnalysisState => {
  const normalizedOptions = normalizeRuleOptions(cwd, ruleOptions);
  const cacheKey = getCacheKey(cwd, normalizedOptions);
  const cachedAnalysis = getCachedAnalysis(cacheKey);

  if (cachedAnalysis) {
    return cachedAnalysis;
  }

  const analysisState = createEmptyAnalysisState();
  const entryFiles = discoverPageEntryStyles(cwd, normalizedOptions)
    .map(canonicalizeFilePath);

  analysisState.entryFiles = entryFiles;

  for (const entryFile of entryFiles) {
    indexEntryPointReachability(entryFile, cwd, normalizedOptions, analysisState);
  }

  setCachedAnalysis(cacheKey, analysisState);
  return analysisState;
};

export const getDiagnosticsForFile = (
  cwd: string,
  filePath: string,
  ruleOptions: RuleOptions | undefined,
): Diagnostic[] => {
  const analysisState = analyzeWorkspace(cwd, ruleOptions);
  const canonicalFilePath = canonicalizeFilePath(filePath);
  const relatedEntryFiles = analysisState.entryFilesByStylesheet.get(canonicalFilePath);

  if (!relatedEntryFiles) {
    return [];
  }

  const normalizedOptions = normalizeRuleOptions(cwd, ruleOptions);

  for (const entryFile of relatedEntryFiles) {
    analyzeEntryPoint(entryFile, cwd, normalizedOptions, analysisState);
  }

  return analysisState.diagnosticsByFile.get(canonicalFilePath) ?? [];
};

export { canonicalizeFilePath, clearAnalysisCache };
