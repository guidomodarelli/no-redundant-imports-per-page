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
          analyzeConditionalImports: {
            type: 'boolean',
          },
        },
      },
    ],
    messages: {
      redundantImport:
        'Redundant style import "{{importText}}": resolves to "{{resolvedFile}}" and was already included for page entry "{{entryFile}}". First included from "{{firstImporter}}:{{firstLine}}".{{cycleSuffix}}',
    },
  },
  create(context) {
    const filename = (context as Rule.RuleContext & { physicalFilename?: string }).physicalFilename
      ?? context.getFilename();
    const cwd = (context as Rule.RuleContext & { cwd?: string }).cwd ?? process.cwd();
    const options = context.options[0] as RuleOptions | undefined;

    if (filename === '<input>') {
      return {};
    }

    return {
      Program(node) {
        const diagnostics = getDiagnosticsForFile(cwd, filename, options);

        for (const diagnostic of diagnostics) {
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
            messageId: 'redundantImport',
            data: {
              importText: diagnostic.importText,
              resolvedFile: diagnostic.resolvedFile,
              entryFile: diagnostic.entryFile,
              firstImporter: diagnostic.firstSeen.importerFile,
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
