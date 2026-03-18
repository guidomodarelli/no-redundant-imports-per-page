import fs from 'node:fs';
import path from 'node:path';

import type { AnalysisState, NormalizedRuleOptions } from './types';

const normalizePathSeparators = (filePath: string): string =>
  filePath.split(path.sep).join(path.posix.sep);

export const canonicalizeFilePath = (filePath: string): string => {
  const resolvedPath = path.resolve(filePath);

  try {
    return normalizePathSeparators(fs.realpathSync.native(resolvedPath));
  } catch {
    return normalizePathSeparators(resolvedPath);
  }
};

const resolveAliasPath = (
  importPath: string,
  aliases: Record<string, string>,
): string | null => {
  const sortedAliasEntries = Object.entries(aliases).sort(
    ([leftAlias], [rightAlias]) => rightAlias.length - leftAlias.length,
  );

  for (const [alias, aliasTarget] of sortedAliasEntries) {
    if (importPath === alias) {
      return aliasTarget;
    }

    if (importPath.startsWith(`${alias}/`)) {
      const aliasedRemainder = importPath.slice(alias.length + 1);
      return path.join(aliasTarget, aliasedRemainder);
    }
  }

  return null;
};

const buildCandidateFiles = (
  targetPath: string,
  styleExtensions: string[],
): string[] => {
  const candidateFiles: string[] = [];
  const parsedTarget = path.parse(targetPath);
  const targetHasExtension = styleExtensions.includes(parsedTarget.ext);

  if (targetHasExtension) {
    candidateFiles.push(targetPath);

    if (!parsedTarget.base.startsWith('_')) {
      candidateFiles.push(path.join(parsedTarget.dir, `_${parsedTarget.base}`));
    }

    return candidateFiles;
  }

  for (const extension of styleExtensions) {
    candidateFiles.push(`${targetPath}${extension}`);

    if (!parsedTarget.base.startsWith('_')) {
      candidateFiles.push(path.join(parsedTarget.dir, `_${parsedTarget.base}${extension}`));
    }
  }

  for (const extension of styleExtensions) {
    candidateFiles.push(path.join(targetPath, `index${extension}`));
    candidateFiles.push(path.join(targetPath, `_index${extension}`));
  }

  return candidateFiles;
};

const resolveExistingFile = (
  targetPath: string,
  styleExtensions: string[],
  analysisState: AnalysisState,
): string | null => {
  const cachedResolution = analysisState.targetPathResolveCache.get(targetPath);

  if (cachedResolution !== undefined) {
    return cachedResolution;
  }

  const seenCandidates = new Set<string>();

  for (const candidateFile of buildCandidateFiles(targetPath, styleExtensions)) {
    const resolvedCandidateFile = path.resolve(candidateFile);

    if (seenCandidates.has(resolvedCandidateFile)) {
      continue;
    }

    seenCandidates.add(resolvedCandidateFile);

    if (!fs.existsSync(resolvedCandidateFile)) {
      continue;
    }

    if (!fs.statSync(resolvedCandidateFile).isFile()) {
      continue;
    }

    const canonicalResolvedFile = canonicalizeFilePath(resolvedCandidateFile);
    analysisState.targetPathResolveCache.set(targetPath, canonicalResolvedFile);
    return canonicalResolvedFile;
  }

  analysisState.targetPathResolveCache.set(targetPath, null);
  return null;
};

const isRelativeImport = (importPath: string): boolean =>
  importPath.startsWith('./') || importPath.startsWith('../');

const isAbsoluteFileImport = (importPath: string): boolean =>
  importPath.startsWith(path.sep);

export const resolveStyleImport = (
  importerFile: string,
  importText: string,
  cwd: string,
  options: NormalizedRuleOptions,
  analysisState: AnalysisState,
): string | null => {
  const cacheKey = `${importerFile}::${importText}`;
  const cachedResolution = analysisState.resolveCache.get(cacheKey);

  if (cachedResolution !== undefined) {
    return cachedResolution;
  }

  const normalizedImportText = importText.trim().replace(/^~/, '');
  let targetPath: string | null = null;

  if (isRelativeImport(normalizedImportText)) {
    targetPath = path.resolve(path.dirname(importerFile), normalizedImportText);
  } else if (isAbsoluteFileImport(normalizedImportText)) {
    targetPath = normalizedImportText;
  } else {
    targetPath = resolveAliasPath(normalizedImportText, options.aliases);

    if (!targetPath && options.includeNodeModules) {
      targetPath = path.resolve(cwd, 'node_modules', normalizedImportText);
    }
  }

  const resolvedFile = targetPath
    ? resolveExistingFile(targetPath, options.styleExtensions, analysisState)
    : null;

  analysisState.resolveCache.set(cacheKey, resolvedFile);
  return resolvedFile;
};
