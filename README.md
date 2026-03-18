# no-redundant-imports-per-page

ESLint plugin that detects redundant CSS/Sass/SCSS `@import` statements inside the dependency tree of each page stylesheet entry point.

## What it checks

For every page stylesheet entry point discovered under `pages` or `nordic-pages`, the rule:

1. Resolves every top-level `@import`
2. Builds the import tree with DFS
3. Canonicalizes every resolved file path
4. Reports the import that reintroduces a previously visited stylesheet in the same page tree
5. Adds a page-level diagnostic when the redundant import happens in a descendant stylesheet reached by that page

## Examples

See [docs/analysis-flow.md](docs/analysis-flow.md) for a visual walkthrough of the DFS traversal, `firstSeen`, and cycle detection.

#### 1. Direct duplicate inside a page entry point

```scss
@import '~@root/app/components/SearchDropdown/styles';
@import '~@root/app/components/SearchDropdown/styles';
```

#### 2. Transitive duplicate through different component branches

```scss
// page stylesheet
@import '~@root/app/components/BranchA/styles';
@import '~@root/app/components/BranchB/styles';
```

```scss
// BranchA/styles.scss
@import '../Shared/styles';
```

```scss
// BranchB/styles.scss
@import '../Shared/styles';
```

When this happens, the rule reports:

- the redundant import in `BranchB/styles.scss`
- a page-level diagnostic in the page stylesheet that imported the `BranchB` branch

#### 3. Duplicate inside a reusable component

```scss
// Card/styles.scss
@import '../Shared/styles';
@import '../Shared/styles';
```

```scss
// page A
@import '~@root/app/components/Card/styles';
```

```scss
// page B
@import '~@root/app/components/Card/styles';
```

#### 4. Top-level imports with rules in between

```scss
@import './variables';

.button {
  color: red;
}

@import './card';
```

#### 5. Nested imports are ignored

```scss
.wrapper {
  @import './card';
}
```

```scss
@mixin mobileStyles {
  @import './card';
}
```

Blank lines, comments, and spaces between top-level imports do not affect detection.

## Installation

```bash
npm install no-redundant-imports-per-page
```

## Local development usage

You can use the plugin locally from another project without publishing it.

### Option 1: `file:` dependency in `package.json`

In the consumer project, point the dependency to this local folder:

```json
{
  "devDependencies": {
    "no-redundant-imports-per-page": "file:../no-redundant-imports-per-page"
  }
}
```

Then run:

```bash
npm install
```

If you change this plugin, rebuild it before testing the consumer project:

```bash
npm run build
```

This is the simplest local workflow.

### Option 2: `npm link`

From this package:

```bash
npm link
```

From the consumer project:

```bash
npm link no-redundant-imports-per-page
```

This is useful when you want to iterate quickly across multiple local changes, but `file:` is usually more predictable.

### Which package name should you use?

There are two valid ways to reference this local package, depending on how the consumer project loads ESLint plugins:

- `no-redundant-imports-per-page`
- `eslint-plugin-no-redundant-imports-per-page`

Use `no-redundant-imports-per-page` when the consumer project imports the package directly in JavaScript, for example in ESLint flat config or in custom scripts:

```js
const plugin = require('no-redundant-imports-per-page');
```

Use `eslint-plugin-no-redundant-imports-per-page` when the consumer project uses legacy `.eslintrc*` config and references the plugin by name in `plugins` or `extends`. ESLint 8 resolves those entries using the `eslint-plugin-*` naming convention:

```json
{
  "plugins": ["no-redundant-imports-per-page"]
}
```

In practice:

- Flat config: install `no-redundant-imports-per-page`
- Legacy `.eslintrc*`: install `eslint-plugin-no-redundant-imports-per-page`
- Mixed setups that use both styles may install both names pointing to the same local folder

## ESLint 8 usage

```js
module.exports = {
  plugins: ['no-redundant-imports-per-page'],
  extends: ['plugin:no-redundant-imports-per-page/recommended'],
};
```

## ESLint 9 flat config usage

```js
const plugin = require('no-redundant-imports-per-page');

module.exports = [
  ...plugin.configs['flat/recommended'],
];
```

## Notes

- The rule always resolves `@root` to the current ESLint `cwd`
- It also reads `package.json#_moduleAliases` automatically, then applies any explicit `aliases` passed in the rule config as the final override
- `node_modules` imports are analyzed by default
- `mode: "simple"` is the default for `node_modules` analysis
- `nodeModulesDepth` only applies in `mode: "simple"` and defaults to `0`
- When a redundant import happens in a descendant component, the rule reports it both in the descendant stylesheet and in the page stylesheet that reached it
- Redundancies resolved through `node_modules` are also added to the page stylesheet by default
- The rule is designed for projects still using `@import`
- It ignores `@import url(...)` and conditional imports by default
- It compares canonical absolute paths to avoid false negatives from alias or relative path variations

## Enabling `node_modules` resolution

By default, the rule resolves stylesheet imports through `node_modules`.

With the default configuration:

- `mode: "simple"` analyzes only direct `node_modules` imports by default
- `nodeModulesDepth` increases how far the rule can recurse inside `node_modules` while staying in `simple`
- `mode: "advanced"` enables full recursive analysis inside `node_modules`

If you want to disable this behavior, set `includeNodeModules: false`.

If you want to stop surfacing redundancies from `node_modules` descendants in the page stylesheet, set `reportNodeModulesInPage: false`.

### ESLint 8

```js
module.exports = {
  plugins: ['no-redundant-imports-per-page'],
  overrides: [
    {
      files: ['**/*.{scss,sass,css}'],
      processor: 'no-redundant-imports-per-page/stylesheet',
      rules: {
        'no-redundant-imports-per-page/no-redundant-imports-per-page': [
          'error',
          {
            mode: 'simple',
            nodeModulesDepth: 0,
          },
        ],
      },
    },
  ],
};
```

### ESLint 9 flat config

```js
const plugin = require('no-redundant-imports-per-page');

module.exports = [
  {
    files: ['**/*.{scss,sass,css}'],
    plugins: {
      'no-redundant-imports-per-page': plugin,
    },
    processor: 'no-redundant-imports-per-page/stylesheet',
    rules: {
      'no-redundant-imports-per-page/no-redundant-imports-per-page': [
        'error',
        {
          mode: 'simple',
          nodeModulesDepth: 0,
        },
      ],
    },
  },
];
```

### Full recursive analysis in `node_modules`

```js
const plugin = require('no-redundant-imports-per-page');

module.exports = [
  {
    files: ['**/*.{scss,sass,css}'],
    plugins: {
      'no-redundant-imports-per-page': plugin,
    },
    processor: 'no-redundant-imports-per-page/stylesheet',
    rules: {
      'no-redundant-imports-per-page/no-redundant-imports-per-page': [
        'error',
        {
          mode: 'advanced',
        },
      ],
    },
  },
];
```
