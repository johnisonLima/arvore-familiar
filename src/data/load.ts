import type { FamilyData } from '../domain/types';
import { assertFamilyData, FamilyValidationError } from '../domain/validate';

export function loadFamilyData(input: unknown): FamilyData {
  assertFamilyData(input);
  return input;
}

export function parseFamilyData(text: string): FamilyData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON inválido: ${message}`);
  }
  return loadFamilyData(parsed);
}

export { FamilyValidationError };
