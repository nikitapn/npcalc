export type SolutionCardData = {
  id: number;
  name: string;
  author: string;
  elements: Record<string, number>;
  ratios: {
    NH4Percent: string;
    NK: string;
    KCa: string;
    KMg: string;
    CaMg: string;
    delta: string;
    EC: string;
  };
};

export type FertilizerCardData = {
  id: number;
  name: string;
  author: string;
  cost: string;
  elements: Record<string, string>;
};

const solutionNames = [
  "Cucumber Starter",
  "Basil Booklet",
  "Leafy Greens Dial-In",
  "Tomato Fruit Push",
  "Pepper Compact Growth",
  "Strawberry Bloom",
  "Herb House Mix",
  "Lettuce Cool Season",
];

const fertilizerNames = [
  "Ammonium nitrate",
  "Calcium nitrate",
  "Monopotassium phosphate",
  "Potassium sulfate",
  "Magnesium nitrate",
  "Magnesium sulfate",
  "MasterBlend 4-18-38",
  "Calcium nitrate double salt",
];

const authors = ["superuser", "guest", "greenhouse team", "trial grower"];
const elementKeys = ["NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];

function cycleValue(seed: number, min: number, max: number, precision = 0): string {
  const span = max - min;
  const raw = min + (((seed * 37) % 100) / 100) * span;
  return raw.toFixed(precision);
}

export const mockSolutions: SolutionCardData[] = Array.from({ length: 120 }, (_, index) => {
  const elements = Object.fromEntries(
    elementKeys.map((key, keyIndex) => {
      const base = 12 + (((index + 3) * (keyIndex + 5) * 11) % 260);
      return [key, keyIndex < 8 ? base : Number((base / 100).toFixed(2))];
    })
  ) as Record<string, number>;

  return {
    id: index + 1,
    name: `${solutionNames[index % solutionNames.length]} ${index + 1}`,
    author: authors[index % authors.length],
    elements,
    ratios: {
      NH4Percent: cycleValue(index + 1, 1.2, 9.8, 1),
      NK: cycleValue(index + 2, 0.72, 1.36, 2),
      KCa: cycleValue(index + 3, 1.1, 2.05, 2),
      KMg: cycleValue(index + 4, 2.2, 4.1, 2),
      CaMg: cycleValue(index + 5, 1.4, 2.8, 2),
      delta: cycleValue(index + 6, -0.45, 0.55, 2),
      EC: cycleValue(index + 7, 1.2, 3.1, 2),
    },
  };
});

export const mockFertilizers: FertilizerCardData[] = Array.from({ length: 72 }, (_, index) => ({
  id: index + 1,
  name: `${fertilizerNames[index % fertilizerNames.length]} ${index + 1}`,
  author: authors[(index + 1) % authors.length],
  cost: cycleValue(index + 8, 0.18, 3.25, 2),
  elements: {
    N: cycleValue(index + 1, 0.5, 12.5, 2),
    P: cycleValue(index + 2, 0.2, 6.4, 2),
    K: cycleValue(index + 3, 1.1, 14.8, 2),
    Ca: cycleValue(index + 4, 0.3, 8.5, 2),
    Mg: cycleValue(index + 5, 0.2, 4.6, 2),
    S: cycleValue(index + 6, 0.2, 7.1, 2),
  },
}));