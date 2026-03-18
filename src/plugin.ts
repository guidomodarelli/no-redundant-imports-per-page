import noRedundantImportsPerPageRule from './rules/no-redundant-imports-per-page';
import { stylesheetProcessor } from './processor/stylesheet';

const plugin = {
  meta: {
    name: 'no-redundant-imports-per-page',
  },
  processors: {
    stylesheet: stylesheetProcessor,
  },
  rules: {
    'no-redundant-imports-per-page': noRedundantImportsPerPageRule,
  },
  configs: {} as Record<string, unknown>,
};

plugin.configs.recommended = [
  {
    files: ['**/*.{scss,sass,css}'],
    plugins: {
      'no-redundant-imports-per-page': plugin,
    },
    processor: 'no-redundant-imports-per-page/stylesheet',
    rules: {
      'no-redundant-imports-per-page/no-redundant-imports-per-page': 'error',
    },
  },
];

export default plugin;
