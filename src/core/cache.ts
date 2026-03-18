import path from 'node:path';

import type { AnalysisState, NormalizedRuleOptions } from './types';

const analysisCache = new Map<string, AnalysisState>();

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
};

export const getCacheKey = (cwd: string, options: NormalizedRuleOptions): string =>
  `${path.resolve(cwd)}::${stableSerialize(options)}`;

export const getCachedAnalysis = (cacheKey: string): AnalysisState | undefined =>
  analysisCache.get(cacheKey);

export const setCachedAnalysis = (cacheKey: string, analysis: AnalysisState): void => {
  analysisCache.set(cacheKey, analysis);
};

export const clearAnalysisCache = (): void => {
  analysisCache.clear();
};
