export const UOM_OPTIONS: {
  value: string;
  label: string;
  description: string;
}[] = [
  { value: "m", label: "m", description: "Meter (length)" },
  { value: "kg", label: "kg", description: "Kilogram (mass)" },
  { value: "pcs", label: "pcs", description: "Pieces (count)" },
];

// Each dimension is in millimeters; multiply by 0.001 to convert to meters.
// If a dimension is missing (0 or falsy), it's skipped (treated as 1) so the
// material can have 1, 2, or 3 dimensions and amount is still applied.
const DIM_FACTOR = 0.001;

export const calcMaterialTotal = (
  length: number,
  width: number,
  thickness: number,
  density: number,
  amount: number,
) => {
  const l = length > 0 ? length * DIM_FACTOR : 1;
  const w = width > 0 ? width * DIM_FACTOR : 1;
  const t = thickness > 0 ? thickness * DIM_FACTOR : 1;
  const d = density > 0 ? density : 1;
  const a = amount > 0 ? amount : 0;
  return l * w * t * d * a;
};
