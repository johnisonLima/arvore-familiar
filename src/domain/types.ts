export const CURRENT_SCHEMA_VERSION = 1;

export type PersonId = string;
export type UnionId = string;
export type Sex = 'M' | 'F' | 'X' | 'U';

export interface PartialDate {
  year?: number;
  month?: number;
  day?: number;
  approx?: boolean;
  raw?: string;
}

export interface Person {
  id: PersonId;
  name: string;
  sex?: Sex;
  birth?: PartialDate;
  death?: PartialDate;
  birthPlace?: string;
  bio?: string;
  photo?: string;
  aliases?: string[];
  private?: boolean;
}

export type UnionStatus =
  | 'married'
  | 'partners'
  | 'divorced'
  | 'separated'
  | 'widowed'
  | 'unknown';

export interface Union {
  id: UnionId;
  partners: PersonId[];
  children: PersonId[];
  status?: UnionStatus;
  start?: PartialDate;
  end?: PartialDate;
  place?: string;
  note?: string;
}

export interface FamilyMeta {
  title: string;
  description?: string;
  rootPersonId: PersonId;
  locale?: string;
  updatedAt?: string;
}

export interface FamilyData {
  schemaVersion: number;
  meta: FamilyMeta;
  persons: Record<PersonId, Person>;
  unions: Record<UnionId, Union>;
}
