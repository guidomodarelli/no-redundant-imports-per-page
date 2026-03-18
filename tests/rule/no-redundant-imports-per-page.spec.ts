import path from 'node:path';

import { ESLint } from 'eslint';
import { LegacyESLint } from 'eslint/use-at-your-own-risk';

import plugin, { clearAnalysisCache } from '../../src';

const workspaceRoot = path.resolve(__dirname, '../fixtures/workspace');

const getFixturePath = (...segments: string[]): string =>
  path.join(...segments).split(path.sep).join('/');

const lintFile = async (...segments: string[]) => {
  clearAnalysisCache();

  const eslint = new ESLint({
    cwd: workspaceRoot,
    overrideConfigFile: true,
    overrideConfig: plugin.configs['flat/recommended'] as any,
  });

  const targetFile = path.join(...segments);
  const results = await eslint.lintFiles([targetFile]);

  return results[0]?.messages ?? [];
};

const lintFileWithFlatRuleOptions = async (
  segments: string[],
  ruleOptions: Record<string, unknown>,
) => {
  clearAnalysisCache();

  const eslint = new ESLint({
    cwd: workspaceRoot,
    overrideConfigFile: true,
    overrideConfig: [
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
          'no-redundant-imports-per-page/no-redundant-imports-per-page': ['error', ruleOptions],
        },
      },
    ] as any,
  });

  const targetFile = path.join(...segments);
  const results = await eslint.lintFiles([targetFile]);

  return results[0]?.messages ?? [];
};

const lintFileWithLegacyConfig = async (...segments: string[]) => {
  clearAnalysisCache();

  const eslint = new LegacyESLint({
    cwd: workspaceRoot,
    overrideConfigFile: null as any,
    overrideConfig: plugin.configs.recommended as any,
    plugins: {
      'no-redundant-imports-per-page': plugin as any,
    },
    useEslintrc: false,
  });

  const targetFile = path.join(...segments);
  const results = await eslint.lintFiles([targetFile]);

  return results[0]?.messages ?? [];
};

describe('no-redundant-imports-per-page rule', () => {
  it('reports direct duplicate imports inside a page entry', async () => {
    const messages = await lintFile('app/pages/userCreate/styles.scss');

    expect(messages).toHaveLength(3);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Page entry "${getFixturePath('app/pages/userCreate/styles.scss')}" reaches redundant style import "~@root/app/styles/common" in "${getFixturePath('app/components/SearchDropdown/styles.scss')}": resolves to "${getFixturePath('app/styles/_common.scss')}" and was already included from "${getFixturePath('app/pages/userCreate/styles.scss')}:1".`,
    );
    expect(messages[1]?.line).toBe(3);
    expect(messages[1]?.message).toBe(
      `Redundant style import "@root/app/components/SearchDropdown/styles": resolves to "${getFixturePath('app/components/SearchDropdown/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/userCreate/styles.scss')}". First included from "${getFixturePath('app/pages/userCreate/styles.scss')}:2".`,
    );
    expect(messages[2]?.line).toBe(5);
    expect(messages[2]?.message).toBe(
      `Redundant style import "~@root/app/components/UserRolesCard/styles": resolves to "${getFixturePath('app/components/UserRolesCard/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/userCreate/styles.scss')}". First included from "${getFixturePath('app/pages/userCreate/styles.scss')}:4".`,
    );
  });

  it('reports transitive duplicates reached through different branches', async () => {
    const messages = await lintFile('app/components/BranchB/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toBe(
      `Redundant style import "../Shared/styles": resolves to "${getFixturePath('app/components/Shared/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/transitive/styles.scss')}". First included from "${getFixturePath('app/components/BranchA/styles.scss')}:1".`,
    );
  });

  it('reports transitive duplicates from the page entry that reaches them', async () => {
    const messages = await lintFile('app/pages/transitive/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Page entry "${getFixturePath('app/pages/transitive/styles.scss')}" reaches redundant style import "../Shared/styles" in "${getFixturePath('app/components/BranchB/styles.scss')}": resolves to "${getFixturePath('app/components/Shared/styles.scss')}" and was already included from "${getFixturePath('app/components/BranchA/styles.scss')}:1".`,
    );
  });

  it('supports multiple imports declared in the same statement', async () => {
    const messages = await lintFile('app/pages/multiImport/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toBe(
      `Redundant style import "@root/app/components/SearchDropdown/styles": resolves to "${getFixturePath('app/components/SearchDropdown/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/multiImport/styles.scss')}". First included from "${getFixturePath('app/pages/multiImport/styles.scss')}:1".`,
    );
  });

  it('reports cycles as redundant imports', async () => {
    const messages = await lintFile('app/components/CycleB/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toBe(
      `Redundant style import "~@root/app/components/CycleA/styles": resolves to "${getFixturePath('app/components/CycleA/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/cycle/styles.scss')}". First included from "${getFixturePath('app/pages/cycle/styles.scss')}:1". Cycle detected in the dependency chain.`,
    );
  });

  it('ignores duplicates that only resolve through node_modules by default', async () => {
    const messages = await lintFile('app/pages/nodeModules/styles.scss');

    expect(messages).toHaveLength(0);
  });

  it('reports duplicates that come from node_modules imports when enabled explicitly', async () => {
    const messages = await lintFileWithFlatRuleOptions(
      ['app/pages/nodeModules/styles.scss'],
      { includeNodeModules: true },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Redundant style import "~@andes/button/index": resolves to "${getFixturePath('node_modules/@andes/button/index.scss')}" and was already included for page entry "${getFixturePath('app/pages/nodeModules/styles.scss')}". First included from "${getFixturePath('app/components/ButtonWrapper/styles.scss')}:1".`,
    );
  });

  it('reports node_modules duplicates inside the second component when enabled explicitly', async () => {
    const messages = await lintFileWithFlatRuleOptions(
      ['app/components/ButtonWrapperDuplicate/styles.scss'],
      { includeNodeModules: true },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toBe(
      `Redundant style import "~@andes/button/index": resolves to "${getFixturePath('node_modules/@andes/button/index.scss')}" and was already included for page entry "${getFixturePath('app/pages/nodeModulesBranches/styles.scss')}". First included from "${getFixturePath('app/components/ButtonWrapper/styles.scss')}:1".`,
    );
  });

  it('does not report node_modules duplicates from the page entry unless explicitly enabled', async () => {
    const messages = await lintFileWithFlatRuleOptions(
      ['app/pages/nodeModulesBranches/styles.scss'],
      { includeNodeModules: true },
    );

    expect(messages).toHaveLength(0);
  });

  it('reports node_modules duplicates from the page entry when page aggregation is explicitly enabled', async () => {
    const messages = await lintFileWithFlatRuleOptions(
      ['app/pages/nodeModulesBranches/styles.scss'],
      { includeNodeModules: true, reportNodeModulesInPage: true },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Page entry "${getFixturePath('app/pages/nodeModulesBranches/styles.scss')}" reaches redundant style import "~@andes/button/index" in "${getFixturePath('app/components/ButtonWrapperDuplicate/styles.scss')}": resolves to "${getFixturePath('node_modules/@andes/button/index.scss')}" and was already included from "${getFixturePath('app/components/ButtonWrapper/styles.scss')}:1".`,
    );
  });

  it('does not report node_modules duplicates from descendant components by default', async () => {
    const pageMessages = await lintFile('app/pages/nodeModulesBranches/styles.scss');
    const componentMessages = await lintFile('app/components/ButtonWrapperDuplicate/styles.scss');

    expect(pageMessages).toHaveLength(0);
    expect(componentMessages).toHaveLength(0);
  });

  it('reads aliases from package.json _moduleAliases', async () => {
    const messages = await lintFile('app/pages/packageAliases/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Redundant style import "@app/styles/common": resolves to "${getFixturePath('app/styles/_common.scss')}" and was already included for page entry "${getFixturePath('app/pages/packageAliases/styles.scss')}". First included from "${getFixturePath('app/pages/packageAliases/styles.scss')}:1".`,
    );
  });

  it('resolves Sass partials and omitted extensions without false positives', async () => {
    const messages = await lintFile('app/pages/partials/styles.scss');

    expect(messages).toHaveLength(0);
  });

  it('ignores url imports and conditional imports by default', async () => {
    const messages = await lintFile('app/pages/conditional/styles.scss');

    expect(messages).toHaveLength(0);
  });

  it('integrates with the stylesheet processor through ESLint flat config', async () => {
    const messages = await lintFile('app/pages/usersSilosLink/styles.scss');

    expect(messages).toHaveLength(2);
    expect(messages[0]?.line).toBe(4);
    expect(messages[1]?.line).toBe(5);
  });

  it('integrates with ESLint legacy config for ESLint 8 consumers', async () => {
    const messages = await lintFileWithLegacyConfig('app/pages/usersSilosLink/styles.scss');

    expect(messages).toHaveLength(2);
    expect(messages[0]?.line).toBe(4);
    expect(messages[1]?.line).toBe(5);
  });
});
