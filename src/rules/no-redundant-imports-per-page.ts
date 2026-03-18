import fs from 'node:fs';
import path from 'node:path';

import type { Rule } from 'eslint';

import { getDiagnosticsForFile } from '../core/analyzer';
import type { RuleOptions } from '../core/types';

const getLineLengths = (filename: string): number[] =>
  fs.readFileSync(filename, 'utf8').split(/\r?\n/).map((line) => line.length);

const getFullLineRange = (
  diagnostic: {
    loc: {
      line: number;
      endLine?: number;
    };
  },
  lineLengths: number[],
) => {
  const startLine = diagnostic.loc.line;
  const endLine = diagnostic.loc.endLine ?? diagnostic.loc.line;

  return {
    start: {
      line: startLine,
      column: 0,
    },
    end: {
      line: endLine,
      column: lineLengths[endLine - 1] ?? 0,
    },
  };
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect redundant style imports inside the dependency tree of a page entry point.',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          pageDirNames: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          pageStyleNames: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          styleExtensions: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          pageModuleNames: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          aliases: {
            type: 'object',
            additionalProperties: {
              type: 'string',
            },
          },
          includeNodeModules: {
            type: 'boolean',
          },
          mode: {
            type: 'string',
            enum: ['simple', 'advanced'],
          },
          nodeModulesDepth: {
            type: 'integer',
            minimum: 0,
          },
          reportNodeModulesInPage: {
            type: 'boolean',
          },
          analyzeConditionalImports: {
            type: 'boolean',
          },
        },
      },
    ],
    messages: {
      redundantImport:
        'Duplicated import "{{importText}}" in "{{redundantImporter}}". First seen at "{{firstImporter}}:{{firstLine}}" for page "{{entryFile}}".{{cycleSuffix}}',
      redundantImportViaPage:
        'Duplicated import "{{importText}}" in "{{redundantImporter}}". First seen at "{{firstImporter}}:{{firstLine}}" for page "{{entryFile}}".{{cycleSuffix}}',
    },
  },
  create(context) {
    const filename = (context as Rule.RuleContext & { physicalFilename?: string }).physicalFilename
      ?? context.getFilename();
    const cwd = (context as Rule.RuleContext & { cwd?: string }).cwd ?? process.cwd();
    const options = context.options[0] as RuleOptions | undefined;
    const toProjectRelativePath = (filePath: string): string =>
      path.relative(cwd, filePath).split(path.sep).join(path.posix.sep);

    if (filename === '<input>') {
      return {};
    }

    return {
      Program(node) {
        const diagnostics = getDiagnosticsForFile(cwd, filename, options);
        const lineLengths = getLineLengths(filename);

        for (const diagnostic of diagnostics) {
          const messageId = diagnostic.kind === 'pageAggregate'
            ? 'redundantImportViaPage'
            : 'redundantImport';

          context.report({
            node,
            loc: getFullLineRange(diagnostic, lineLengths),
            messageId,
            data: {
              importText: diagnostic.importText,
              resolvedFile: toProjectRelativePath(diagnostic.resolvedFile),
              entryFile: toProjectRelativePath(diagnostic.entryFile),
              redundantImporter: toProjectRelativePath(diagnostic.redundantImporterFile),
              firstImporter: toProjectRelativePath(diagnostic.firstSeen.importerFile),
              firstLine: String(diagnostic.firstSeen.loc.line),
              cycleSuffix: diagnostic.cycle ? ' Cycle detected in the dependency chain.' : '',
            },
          });
        }
      },
    };
  },
};

export default rule;
