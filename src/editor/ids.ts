const MAX_SLUG_LENGTH = 48;

export const slugifyId = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

const unique = (prefix: string, base: string, taken: ReadonlySet<string>): string => {
  const root = `${prefix}-${base}`;
  if (!taken.has(root)) return root;

  let index = 2;
  while (taken.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
};

export function createPersonId(name: string, taken: ReadonlySet<string>): string {
  return unique('p', slugifyId(name) || 'pessoa', taken);
}

export function createUnionId(partnerNames: string[], taken: ReadonlySet<string>): string {
  return unique('u', slugifyId(partnerNames.join(' ')) || 'uniao', taken);
}
