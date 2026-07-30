import type { CalcMode } from "../types/materialControl.types";

// Each dimension is entered in millimeters; multiply by 0.001 to convert to
// meters before plugging into a formula.
const DIM_FACTOR = 0.001;

// Density values (both material_densities master data and manual entry) are
// in kg/m^3 (e.g. Iron 7860, Steel 7850 — see material_densities table), and
// volume above is in m^3 after DIM_FACTOR, so mass = volume(m^3) * density
// (kg/m^3) directly — no extra scaling.

// Shipyard convention: once a Dimensional/Circular material's computed
// weight is substantial, log that computed kg figure. For small offcuts
// under this threshold, precise weighing isn't worth it — just record the
// piece count the user entered instead.
const WEIGHT_THRESHOLD_KG = 10;

export interface CalcModeOption {
  value: CalcMode;
  label: string;
  description: string;
}

export const CALC_MODE_OPTIONS: CalcModeOption[] = [
  {
    value: "AREA",
    label: "Area (Blasting/Painting)",
    description:
      "Area (m²) × Layers. Blasting needs no layers (1); painting sets it when more than one coat was applied.",
  },
  {
    value: "DIMENSIONAL",
    label: "Dimensional",
    description:
      "Length × Width × (Thickness, optional) × Density × Amount. Leave Thickness blank for a 2D calculation.",
  },
  {
    value: "CIRCULAR",
    label: "Circular",
    description: "π × (Diameter/2)² × Length × Density × Amount.",
  },
  {
    value: "COUNT",
    label: "Count",
    description: "Amount only, in Ls or pcs — no dimensions involved.",
  },
];

// AREA and the weight-threshold modes (DIMENSIONAL/CIRCULAR) resolve their
// unit automatically. COUNT leaves the unit up to the user — these are just
// common suggestions for the datalist, not a fixed set.
export const COUNT_UOM_SUGGESTIONS: string[] = ["Ls", "pcs", "unit", "set"];

// Area is measured directly in the field (m²), not derived from Length x
// Width. Layers is optional — blasting is implicitly 1 layer; painting sets
// it only when more than one coat was applied.
export function calcAreaTotal(area: number, layers: number): number {
  const a = area > 0 ? area : 0;
  const n = layers > 0 ? layers : 1;
  return a * n;
}

// The original generic formula: any missing/zero dimension is treated as 1,
// so this doubles as the "2D" calculation when thickness is left blank.
export function calcDimensionalTotal(
  length: number,
  width: number,
  thickness: number,
  density: number,
  amount: number,
): number {
  const l = length > 0 ? length * DIM_FACTOR : 1;
  const w = width > 0 ? width * DIM_FACTOR : 1;
  const t = thickness > 0 ? thickness * DIM_FACTOR : 1;
  const d = density > 0 ? density : 1;
  const a = amount > 0 ? amount : 0;
  return l * w * t * d * a;
}

// Matches the team's existing Excel formula
// (=3.14*((L/2)^2)*length*amount*density/1000000) — L is the diameter, and
// the /2 to get the true radius happens here, not at entry time, so the
// team can type the same nominal size (e.g. "22" for a D22 rod) they
// already use.
export function calcCircularTotal(
  diameter: number,
  length: number,
  density: number,
  amount: number,
): number {
  const r = diameter > 0 ? (diameter / 2) * DIM_FACTOR : 0;
  const l = length > 0 ? length * DIM_FACTOR : 1;
  const d = density > 0 ? density : 1;
  const a = amount > 0 ? amount : 0;
  return Math.PI * r * r * l * d * a;
}

export function calcCountTotal(amount: number): number {
  return amount > 0 ? amount : 0;
}

// DIMENSIONAL/CIRCULAR only: pick the computed weight once it clears the
// threshold, otherwise fall back to the manually-entered amount in pcs.
function resolveWeightBasedTotal(
  computedKg: number,
  amount: number,
): { total: number; uom: string } {
  if (computedKg >= WEIGHT_THRESHOLD_KG) {
    return { total: computedKg, uom: "kg" };
  }
  return { total: amount > 0 ? amount : 0, uom: "pcs" };
}

export interface CalcFieldInputs {
  length: number;
  width: number;
  thickness: number;
  area: number;
  layers: number;
  diameter: number;
  density: number;
  amount: number;
}

// Single entry point used by the material-entry form: computes the total
// and, for modes with an auto-resolved unit, the uom to store alongside it.
// COUNT returns uom: null since that choice stays with the user (Ls/pcs).
export function calcTotalForMode(
  mode: CalcMode,
  inputs: CalcFieldInputs,
): { total: number; uom: string | null } {
  switch (mode) {
    case "AREA":
      return {
        total: calcAreaTotal(inputs.area, inputs.layers),
        uom: "m2",
      };
    case "CIRCULAR":
      return resolveWeightBasedTotal(
        calcCircularTotal(
          inputs.diameter,
          inputs.length,
          inputs.density,
          inputs.amount,
        ),
        inputs.amount,
      );
    case "COUNT":
      return { total: calcCountTotal(inputs.amount), uom: null };
    case "DIMENSIONAL":
    default:
      return resolveWeightBasedTotal(
        calcDimensionalTotal(
          inputs.length,
          inputs.width,
          inputs.thickness,
          inputs.density,
          inputs.amount,
        ),
        inputs.amount,
      );
  }
}
