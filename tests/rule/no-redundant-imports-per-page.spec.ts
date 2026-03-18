import path from 'node:path';

import { ESLint } from 'eslint';

import plugin, { clearAnalysisCache } from '../../src';

const workspaceRoot = path.resolve(__dirname, '../fixtures/workspace');

const getFixturePath = (...segments: string[]): string =>
  path.join(workspaceRoot, ...segments).split(path.sep).join('/');

const lintFile = async (...segments: string[]) => {
  clearAnalysisCache();

  const eslint = new ESLint({
    cwd: workspaceRoot,
    overrideConfigFile: true,
    overrideConfig: plugin.configs.recommended as any,
  });

  const targetFile = path.join(...segments);
  const results = await eslint.lintFiles([targetFile]);

  return results[0]?.messages ?? [];
};

describe('no-redundant-imports-per-page rule', () => {
  it('reports direct duplicate imports inside a page entry', async () => {
    const messages = await lintFile('app/pages/userCreate/styles.scss');

    expect(messages).toHaveLength(2);
    expect(messages[0]?.line).toBe(3);
    expect(messages[0]?.message).toBe(
      `Redundant style import "@root/app/components/SearchDropdown/styles": resolves to "${getFixturePath('app/components/SearchDropdown/styles.scss')}" and was already included for page entry "${getFixturePath('app/pages/userCreate/styles.scss')}". First included from "${getFixturePath('app/pages/userCreate/styles.scss')}:2".`,
    );
    expect(messages[1]?.line).toBe(5);
    expect(messages[1]?.message).toBe(
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

  it('reports duplicates that come from node_modules imports', async () => {
    const messages = await lintFile('app/pages/nodeModules/styles.scss');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.message).toBe(
      `Redundant style import "~@andes/button/index": resolves to "${getFixturePath('node_modules/@andes/button/index.scss')}" and was already included for page entry "${getFixturePath('app/pages/nodeModules/styles.scss')}". First included from "${getFixturePath('app/components/ButtonWrapper/styles.scss')}:1".`,
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
});
