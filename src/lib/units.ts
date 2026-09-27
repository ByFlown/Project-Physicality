import type { Settings } from '../domain/schema';

export type UnitSystem = Settings['units'];

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export const kgToDisplay = (kg: number, units: UnitSystem) => (units === 'imperial' ? kg * LB_PER_KG : kg);
export const displayToKg = (value: number, units: UnitSystem) => (units === 'imperial' ? value / LB_PER_KG : value);
export const cmToDisplay = (cm: number, units: UnitSystem) => (units === 'imperial' ? cm / CM_PER_IN : cm);
export const displayToCm = (value: number, units: UnitSystem) => (units === 'imperial' ? value * CM_PER_IN : value);

export const weightUnit = (units: UnitSystem) => (units === 'imperial' ? 'lb' : 'kg');
export const lengthUnit = (units: UnitSystem) => (units === 'imperial' ? 'in' : 'cm');

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function formatWeight(kg: number, units: UnitSystem, digits = 1): string {
  return `${round(kgToDisplay(kg, units), digits)} ${weightUnit(units)}`;
}

export function formatLength(cm: number, units: UnitSystem, digits = 1): string {
  return `${round(cmToDisplay(cm, units), digits)} ${lengthUnit(units)}`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}
