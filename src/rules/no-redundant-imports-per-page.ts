import path from 'node:path';

import type { Rule } from 'eslint';

import { getDiagnosticsForFile } from '../core/analyzer';
import type { RuleOptions } from '../core/types';

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
        'Duplicate import: "{{importText}}" in "{{redundantImporter}}". First seen at "{{firstImporter}}:{{firstLine}}" for page "{{entryFile}}".{{cycleSuffix}}',
      redundantImportViaPage:
        'Page duplicate: "{{entryFile}}" reaches "{{importText}}" via "{{redundantImporter}}". First seen at "{{firstImporter}}:{{firstLine}}".{{cycleSuffix}}',
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

        for (const diagnostic of diagnostics) {
          const messageId = diagnostic.kind === 'pageAggregate'
            ? 'redundantImportViaPage'
            : 'redundantImport';

          context.report({
            node,
            loc: {
              start: {
                line: diagnostic.loc.line,
                column: Math.max(0, diagnostic.loc.column - 1),
              },
              end: {
                line: diagnostic.loc.endLine ?? diagnostic.loc.line,
                column: Math.max(0, (diagnostic.loc.endColumn ?? diagnostic.loc.column) - 1),
              },
            },
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
