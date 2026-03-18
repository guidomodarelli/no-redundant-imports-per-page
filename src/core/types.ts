export interface SourceLocation {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ParsedImportEdge {
  importText: string;
  specifier: string | null;
  conditional: boolean;
  isUrlLike: boolean;
  loc: SourceLocation;
}

export interface StyleFileInfo {
  file: string;
  imports: ParsedImportEdge[];
}

export interface ImportOccurrence {
  importerFile: string;
  importText: string;
  resolvedFile: string;
  loc: SourceLocation;
  rootPageImporterFile: string;
  rootPageImportText: string;
  rootPageImportLoc: SourceLocation;
}

export interface Diagnostic {
  kind: 'local' | 'pageAggregate';
  file: string;
  loc: SourceLocation;
  entryFile: string;
  importText: string;
  resolvedFile: string;
  redundantImporterFile: string;
  firstSeen: ImportOccurrence;
  cycle: boolean;
}

export interface AnalysisState {
  entryFiles: string[];
  entryFilesByStylesheet: Map<string, Set<string>>;
  analyzedEntries: Set<string>;
  diagnosticsByFile: Map<string, Diagnostic[]>;
  parseCache: Map<string, StyleFileInfo>;
  resolveCache: Map<string, string | null>;
  targetPathResolveCache: Map<string, string | null>;
}

export interface NormalizedRuleOptions {
  pageDirNames: string[];
  pageStyleNames: string[];
  styleExtensions: string[];
  pageModuleNames: string[];
  aliases: Record<string, string>;
  includeNodeModules: boolean;
  mode: 'simple' | 'advanced';
  nodeModulesDepth: number;
  reportNodeModulesInPage: boolean;
  analyzeConditionalImports: boolean;
}

export type RuleOptions = Partial<{
  pageDirNames: string[];
  pageStyleNames: string[];
  styleExtensions: string[];
  pageModuleNames: string[];
  aliases: Record<string, string>;
  includeNodeModules: boolean;
  mode: 'simple' | 'advanced';
  nodeModulesDepth: number;
  reportNodeModulesInPage: boolean;
  analyzeConditionalImports: boolean;
}>;
