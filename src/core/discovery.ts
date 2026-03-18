import fs from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';

import type { NormalizedRuleOptions } from './types';

const STYLE_PRIORITY = ['styles', 'index'];

const buildPattern = (
  pageDirName: string,
  pageStyleNames: string[],
  styleExtensions: string[],
): string => {
  const namesPattern = `{${pageStyleNames.join(',')}}`;
  const extensionPattern = `{${styleExtensions.map((extension) => extension.slice(1)).join(',')}}`;

  return `**/${pageDirName}/**/${namesPattern}.${extensionPattern}`;
};

const isDirectChildOfPageDirectory = (
  relativeFilePath: string,
  pageDirNames: string[],
): boolean => {
  const segments = relativeFilePath.split(path.sep);
  const pageDirectoryIndex = segments.findIndex((segment) => pageDirNames.includes(segment));

  if (pageDirectoryIndex === -1) {
    return false;
  }

  return segments.length - pageDirectoryIndex === 3;
};

const hasPageModuleSibling = (
  directoryPath: string,
  options: NormalizedRuleOptions,
): boolean =>
  options.pageModuleNames.some((pageModuleName) =>
    ['.js', '.jsx', '.ts', '.tsx'].some((extension) =>
      fs.existsSync(path.join(directoryPath, `${pageModuleName}${extension}`)),
    ),
  );

const getStylePriority = (filePath: string): number => {
  const parsedPath = path.parse(filePath);
  const basenamePriority = STYLE_PRIORITY.indexOf(parsedPath.name);
  const extensionPriority = ['.scss', '.sass', '.css'].indexOf(parsedPath.ext);

  return (basenamePriority === -1 ? STYLE_PRIORITY.length : basenamePriority) * 10
    + (extensionPriority === -1 ? 10 : extensionPriority);
};

export const discoverPageEntryStyles = (
  cwd: string,
  options: NormalizedRuleOptions,
): string[] => {
  const candidateFiles = fg.sync(
    options.pageDirNames.map((pageDirName) =>
      buildPattern(pageDirName, options.pageStyleNames, options.styleExtensions),
    ),
    {
      cwd,
      onlyFiles: true,
      absolute: true,
      unique: true,
      suppressErrors: true,
    },
  );

  const styleByDirectory = new Map<string, string[]>();

  for (const candidateFile of candidateFiles) {
    const resolvedCandidateFile = path.resolve(candidateFile);
    const relativeCandidateFile = path.relative(cwd, resolvedCandidateFile);

    if (!isDirectChildOfPageDirectory(relativeCandidateFile, options.pageDirNames)) {
      continue;
    }

    const directoryPath = path.dirname(resolvedCandidateFile);

    if (!hasPageModuleSibling(directoryPath, options)) {
      continue;
    }

    const existingCandidates = styleByDirectory.get(directoryPath) ?? [];
    existingCandidates.push(resolvedCandidateFile);
    styleByDirectory.set(directoryPath, existingCandidates);
  }

  return [...styleByDirectory.values()]
    .map((files) => files.sort((leftFile, rightFile) => getStylePriority(leftFile) - getStylePriority(rightFile))[0])
    .sort((leftFile, rightFile) => leftFile.localeCompare(rightFile));
};
