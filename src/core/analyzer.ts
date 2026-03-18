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

export const DEFAULT_RULE_OPTIONS: Omit<NormalizedRuleOptions, 'aliases'> = {
  pageDirNames: ['pages', 'nordic-pages'],
  pageStyleNames: ['styles', 'index'],
  styleExtensions: ['.scss', '.sass', '.css'],
  pageModuleNames: ['index', 'view'],
  includeNodeModules: true,
  analyzeConditionalImports: false,
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
    ...(ruleOptions?.aliases ?? {}),
  },
  includeNodeModules: ruleOptions?.includeNodeModules ?? DEFAULT_RULE_OPTIONS.includeNodeModules,
  analyzeConditionalImports:
    ruleOptions?.analyzeConditionalImports ?? DEFAULT_RULE_OPTIONS.analyzeConditionalImports,
});

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

const analyzeEntryPoint = (
  entryFile: string,
  cwd: string,
  options: NormalizedRuleOptions,
  analysisState: AnalysisState,
): void => {
  const firstSeen = new Map<string, ImportOccurrence>();
  const activeStack = new Set<string>();

  const walk = (currentFile: string, chain: string[]): void => {
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

      const currentOccurrence: ImportOccurrence = {
        importerFile: currentFile,
        importText: importEdge.importText,
        resolvedFile,
        loc: importEdge.loc,
        chain: [...chain, currentFile],
      };

      const firstOccurrence = firstSeen.get(resolvedFile);

      if (firstOccurrence) {
        pushDiagnostic(analysisState, {
          file: currentFile,
          loc: importEdge.loc,
          entryFile,
          importText: importEdge.importText,
          resolvedFile,
          firstSeen: firstOccurrence,
          cycle: activeStack.has(resolvedFile),
        });
        continue;
      }

      firstSeen.set(resolvedFile, currentOccurrence);
      walk(resolvedFile, [...chain, currentFile]);
    }

    activeStack.delete(currentFile);
  };

  const canonicalEntryFile = canonicalizeFilePath(entryFile);

  firstSeen.set(canonicalEntryFile, {
    importerFile: canonicalEntryFile,
    importText: '<entry>',
    resolvedFile: canonicalEntryFile,
    loc: {
      line: 1,
      column: 1,
    },
    chain: [],
  });

  walk(canonicalEntryFile, []);
};

const createEmptyAnalysisState = (): AnalysisState => ({
  entryFiles: [],
  diagnosticsByFile: new Map<string, Diagnostic[]>(),
  parseCache: new Map<string, StyleFileInfo>(),
  resolveCache: new Map<string, string | null>(),
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
    analyzeEntryPoint(entryFile, cwd, normalizedOptions, analysisState);
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

  return analysisState.diagnosticsByFile.get(canonicalFilePath) ?? [];
};

export { canonicalizeFilePath, clearAnalysisCache };
