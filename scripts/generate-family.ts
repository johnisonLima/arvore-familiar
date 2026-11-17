import { writeFileSync } from 'node:fs';
import { migrateLegacyFamily } from '../src/data/migrate-v0';
import { LEGACY_ROOT } from '../src/data/legacy-seed';
import { validateFamilyData } from '../src/domain/validate';

const result = migrateLegacyFamily(LEGACY_ROOT, { now: new Date().toISOString() });
const validation = validateFamilyData(result.data);

if (!validation.ok) {
  console.error('A migração produziu dados inválidos:');
  for (const issue of validation.errors) {
    console.error(`- ${issue.path}: ${issue.message} (${issue.code})`);
  }
  process.exitCode = 1;
} else {
  const output = new URL('../src/data/family.json', import.meta.url);
  writeFileSync(output, `${JSON.stringify(result.data, null, 2)}\n`, 'utf8');
  const childLinks = Object.values(result.data.unions).reduce(
    (total, union) => total + union.children.length,
    0,
  );
  console.log(`Gerado: ${output.pathname}`);
  console.log(
    `Pessoas: ${Object.keys(result.data.persons).length} | Uniões: ${Object.keys(result.data.unions).length} | Vínculos: ${childLinks}`,
  );
  if (result.warnings.length) {
    console.warn('Avisos da migração:');
    result.warnings.forEach((warning) => console.warn(`- ${warning}`));
  }
  if (validation.warnings.length) {
    console.warn('Avisos de validação:');
    validation.warnings.forEach((warning) => console.warn(`- ${warning.path}: ${warning.message}`));
  }
}
