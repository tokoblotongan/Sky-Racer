// tools/newArena.ts
// CLI scaffolding script for adding a new arena from src/arenas/_template/.
// Usage: npm run new:arena -- <arena-id> "<Arena Name>"

import fs from 'node:fs';
import path from 'node:path';

const REGISTRY_START = '// ARENA-REGISTRY-START';
const REGISTRY_END = '// ARENA-REGISTRY-END';

function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

function toPascalCase(kebab: string): string {
  const camel = toCamelCase(kebab);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function parseArgs(argv: readonly string[]): { id: string; name: string } {
  let id = '';
  let name = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id' && i + 1 < argv.length) {
      id = argv[++i].trim();
    } else if (arg.startsWith('--id=')) {
      id = arg.slice('--id='.length).trim();
    } else if (arg === '--name' && i + 1 < argv.length) {
      name = argv[++i].trim();
    } else if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length).trim();
    } else if (!arg.startsWith('-')) {
      if (!id) {
        id = arg.trim();
      } else if (!name) {
        name = arg.trim();
      } else {
        name = `${name} ${arg.trim()}`;
      }
    }
  }

  return { id, name };
}

function computeNextOrder(indexSource: string): number {
  const matches = indexSource.match(/registry\.registerArena\(/g);
  return (matches ? matches.length : 0) + 1;
}

function main(): void {
  const { id: rawId, name: rawName } = parseArgs(process.argv.slice(2));
  const id = rawId.toLowerCase();

  if (!id || !/^[a-z][a-z0-9-]{1,40}$/.test(id)) {
    console.error(
      'Invalid or missing arena id. Use lowercase kebab-case (2-41 chars), e.g.: npm run new:arena -- desert-canyon "Desert Canyon"',
    );
    process.exit(1);
  }

  if (['index', 'registry', 'types', '_template'].includes(id)) {
    console.error(`Reserved arena id '${id}' is not allowed.`);
    process.exit(1);
  }

  const displayName = rawName.trim() || toPascalCase(id).replace(/([A-Z])/g, ' $1').trim();
  const camelId = toCamelCase(id);
  const pascalId = toPascalCase(id);

  const rootDir = process.cwd();
  const arenasDir = path.join(rootDir, 'src', 'arenas');
  const templateDir = path.join(arenasDir, '_template');
  const targetDir = path.join(arenasDir, id);
  const indexPath = path.join(arenasDir, 'index.ts');

  if (!fs.existsSync(templateDir)) {
    console.error(`Missing template directory at ${templateDir}`);
    process.exit(1);
  }
  if (fs.existsSync(targetDir)) {
    console.error(`Arena directory already exists: src/arenas/${id}`);
    process.exit(1);
  }
  if (!fs.existsSync(indexPath)) {
    console.error(`Missing arena registry index at ${indexPath}`);
    process.exit(1);
  }

  const indexSource = fs.readFileSync(indexPath, 'utf8');
  if (!indexSource.includes(REGISTRY_START) || !indexSource.includes(REGISTRY_END)) {
    console.error(`Markers ${REGISTRY_START} / ${REGISTRY_END} not found in src/arenas/index.ts`);
    process.exit(1);
  }
  if (indexSource.includes(`./${id}/definition`) || indexSource.includes(`${camelId}Arena`)) {
    console.error(`Arena '${id}' is already registered in src/arenas/index.ts`);
    process.exit(1);
  }

  const nextOrder = computeNextOrder(indexSource);
  const safeNameLiteral = displayName.replace(/'/g, "\\'");

  const applySubstitutions = (src: string, filenameLabel: string): string => {
    return src
      .replace(/\/\/ src\/arenas\/_template\/[^\n]+/, `// src/arenas/${id}/${filenameLabel}`)
      .replace(/'\.\/course\.template'/g, "'./course'")
      .replace(/'\.\/theme\.template'/g, "'./theme'")
      .replace(/'template-arena'/g, `'${id}'`)
      .replace(/'Template Arena'/g, `'${safeNameLiteral}'`)
      .replace(/'template-theme'/g, `'${id}-theme'`)
      .replace(/'template-lighting'/g, `'${id}-lighting'`)
      .replace(/TemplateArenaScenery/g, `${pascalId}Scenery`)
      .replace(/templateArenaCourse/g, `${camelId}Course`)
      .replace(/templateArenaTheme/g, `${camelId}Theme`)
      .replace(/templateArena/g, `${camelId}Arena`)
      .replace(/arenaNumber: 99/g, `arenaNumber: ${nextOrder}`)
      .replace(/order: 99/g, `order: ${nextOrder}`);
  };

  fs.mkdirSync(targetDir, { recursive: true });

  const fileMappings: Array<[string, string]> = [
    ['course.template.ts', 'course.ts'],
    ['theme.template.ts', 'theme.ts'],
    ['definition.template.ts', 'definition.ts'],
  ];

  for (const [srcFile, dstFile] of fileMappings) {
    const templateContent = fs.readFileSync(path.join(templateDir, srcFile), 'utf8');
    const outContent = applySubstitutions(templateContent, dstFile);
    fs.writeFileSync(path.join(targetDir, dstFile), outContent, 'utf8');
  }

  const startIdx = indexSource.indexOf(REGISTRY_START);
  const endIdx = indexSource.indexOf(REGISTRY_END);
  const blockBefore = indexSource.slice(0, startIdx);
  const registryBlock = indexSource.slice(startIdx, endIdx);
  const blockAfter = indexSource.slice(endIdx);

  const importLine = `import { ${camelId}Arena } from './${id}/definition';`;
  const registerLine = `  registry.registerArena(${camelId}Arena);`;

  let updatedBlock = registryBlock.replace(
    /(\r?\nexport function registerDefaultArenas)/,
    `\n${importLine}$1`,
  );
  updatedBlock = updatedBlock.replace(
    /(\r?\n\s*return registry;)/,
    `\n${registerLine}$1`,
  );

  fs.writeFileSync(indexPath, `${blockBefore}${updatedBlock}${blockAfter}`, 'utf8');

  console.log(`Scaffolded arena '${displayName}' (${id}) at src/arenas/${id}/`);
  console.log(`Registered ${camelId}Arena in src/arenas/index.ts with comingSoon: true.`);
  console.log(`Next step: npm run validate:arenas -- --arena ${id}`);
}

main();
