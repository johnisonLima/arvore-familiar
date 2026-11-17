import type { Person, Union, UnionStatus } from '../domain/types';

const NAME_CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di']);

const STATUS_LABELS: Record<UnionStatus, string> = {
  married: 'casados',
  partners: 'parceiros',
  divorced: 'divorciados',
  separated: 'separados',
  widowed: 'viúvos',
  unknown: 'união',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';

  const meaningful = parts.filter((part) => !NAME_CONNECTORS.has(part.toLowerCase()));
  const list = meaningful.length > 0 ? meaningful : parts;

  if (list.length === 1) {
    return (list[0] ?? '').slice(0, 2).toUpperCase() || '?';
  }

  const first = list[0]?.[0] ?? '';
  const last = list[list.length - 1]?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function lifespan(person: Person): string {
  const birth = person.birth?.year;
  const death = person.death?.year;

  if (birth && death) return `${birth} – ${death}`;
  if (birth) return `n. ${birth}`;
  if (death) return `† ${death}`;
  if (person.birth?.raw) return person.birth.raw;
  if (person.death?.raw) return person.death.raw;
  return '';
}

export function unionStatusLabel(status: UnionStatus | undefined): string {
  return status ? STATUS_LABELS[status] : '';
}

export function unionYears(union: Union): string {
  const start = union.start?.year;
  const end = union.end?.year;

  if (start && end) return `${start} – ${end}`;
  if (start) return `${start}`;
  if (end) return `– ${end}`;
  if (union.start?.raw) return union.start.raw;
  return '';
}

export function unionMeta(union: Union): string {
  return [unionStatusLabel(union.status), unionYears(union)].filter(Boolean).join(' · ');
}

export function childCountLabel(count: number): string {
  if (count === 0) return 'sem filhos';
  return count === 1 ? '1 filho' : `${count} filhos`;
}
