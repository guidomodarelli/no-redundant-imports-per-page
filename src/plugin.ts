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

plugin.configs.recommended = {
  plugins: ['no-redundant-imports-per-page'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['**/*.{scss,sass,css}'],
      processor: 'no-redundant-imports-per-page/stylesheet',
      rules: {
        'no-redundant-imports-per-page/no-redundant-imports-per-page': 'error',
      },
    },
  ],
};

plugin.configs['flat/recommended'] = [
  {
    files: ['**/*.{scss,sass,css}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
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
