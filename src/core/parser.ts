import fs from 'node:fs';

import postcssScss from 'postcss-scss';

import type { ParsedImportEdge, SourceLocation, StyleFileInfo } from './types';

interface ParsedImportSpecifier {
  importText: string;
  specifier: string | null;
  conditional: boolean;
  isUrlLike: boolean;
}

const isWhitespace = (value: string): boolean => /\s/.test(value);

const splitImportItems = (params: string): string[] => {
  const items: string[] = [];
  let currentValue = '';
  let quoteCharacter: '"' | "'" | null = null;
  let depth = 0;

  for (let index = 0; index < params.length; index += 1) {
    const character = params[index];

    if (quoteCharacter) {
      currentValue += character;

      if (character === '\\' && index + 1 < params.length) {
        currentValue += params[index + 1];
        index += 1;
        continue;
      }

      if (character === quoteCharacter) {
        quoteCharacter = null;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quoteCharacter = character;
      currentValue += character;
      continue;
    }

    if (character === '(') {
      depth += 1;
      currentValue += character;
      continue;
    }

    if (character === ')') {
      depth = Math.max(0, depth - 1);
      currentValue += character;
      continue;
    }

    if (character === ',' && depth === 0) {
      if (currentValue.trim()) {
        items.push(currentValue.trim());
      }

      currentValue = '';
      continue;
    }

    currentValue += character;
  }

  if (currentValue.trim()) {
    items.push(currentValue.trim());
  }

  return items;
};

const parseQuotedImport = (value: string): ParsedImportSpecifier => {
  const quoteCharacter = value[0];
  let index = 1;
  let specifier = '';

  while (index < value.length) {
    const character = value[index];

    if (character === '\\' && index + 1 < value.length) {
      specifier += value[index + 1];
      index += 2;
      continue;
    }

    if (character === quoteCharacter) {
      index += 1;
      break;
    }

    specifier += character;
    index += 1;
  }

  const suffix = value.slice(index).trim();

  return {
    importText: specifier,
    specifier,
    conditional: suffix.length > 0,
    isUrlLike: false,
  };
};

const parseUnquotedImport = (value: string): ParsedImportSpecifier => {
  const trimmedValue = value.trim();
  const urlMatch = trimmedValue.match(/^url\((.*)\)$/i);

  if (urlMatch) {
    return {
      importText: trimmedValue,
      specifier: null,
      conditional: false,
      isUrlLike: true,
    };
  }

  let index = 0;
  while (index < trimmedValue.length && !isWhitespace(trimmedValue[index])) {
    index += 1;
  }

  const specifier = trimmedValue.slice(0, index);
  const suffix = trimmedValue.slice(index).trim();
  const isRemoteImport = /^(?:https?:)?\/\//i.test(specifier) || /^data:/i.test(specifier);

  return {
    importText: specifier,
    specifier: isRemoteImport ? null : specifier,
    conditional: suffix.length > 0,
    isUrlLike: isRemoteImport,
  };
};

const parseImportParams = (params: string): ParsedImportSpecifier[] =>
  splitImportItems(params).map((item) => {
    if (item.startsWith('"') || item.startsWith("'")) {
      return parseQuotedImport(item);
    }

    return parseUnquotedImport(item);
  });

const getNodeLocation = (line: number, column: number): SourceLocation => ({
  line,
  column,
});

export const parseStyleFile = (filePath: string): StyleFileInfo => {
  const source = fs.readFileSync(filePath, 'utf8');
  const root = postcssScss.parse(source, {
    from: filePath,
  });

  const imports: ParsedImportEdge[] = [];

  root.nodes.forEach((node) => {
    if (node.type !== 'atrule' || node.name !== 'import' || node.parent !== root) {
      return;
    }

    const sourceLocation = node.source?.start ?? { line: 1, column: 1 };

    for (const parsedImport of parseImportParams(node.params)) {
      imports.push({
        importText: parsedImport.importText,
        specifier: parsedImport.specifier,
        conditional: parsedImport.conditional,
        isUrlLike: parsedImport.isUrlLike,
        loc: getNodeLocation(sourceLocation.line, sourceLocation.column),
      });
    }
  });

  return {
    file: filePath,
    imports,
  };
};
