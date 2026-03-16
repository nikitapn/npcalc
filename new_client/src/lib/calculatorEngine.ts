export type ElementKey = "NO3" | "NH4" | "P" | "K" | "Ca" | "Mg" | "S" | "Cl" | "Fe" | "Zn" | "B" | "Mn" | "Cu" | "Mo";
export type FertilizerElementKey = "N" | "NO3" | "NH4" | "P" | "K" | "Ca" | "Mg" | "S";
export type SolutionElements = Record<ElementKey, number>;

export type FertilizerInput = {
  id: number;
  name: string;
  cost: number;
  elements: Partial<Record<FertilizerElementKey, number>>;
};

export type SolutionRatio = {
  nh4Percent: number;
  nk: number;
  kca: number;
  kmg: number;
  camg: number;
};

export type SolutionEc = {
  cations: number;
  anions: number;
  deltaCa: number;
  ec: number;
};

export type SolveResult = {
  doses: number[];
  mixedElements: SolutionElements;
  residual: number;
  totalCostPerLiter: number;
  targetRatio: SolutionRatio;
  mixRatio: SolutionRatio;
  targetEc: SolutionEc;
  mixEc: SolutionEc;
};

export const elementOrder: ElementKey[] = ["NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];

const atomicMassByElement: Record<ElementKey, number> = {
  NO3: 62.0049,
  NH4: 18.0385,
  P: 30.9738,
  K: 39.0983,
  Ca: 40.078,
  Mg: 24.305,
  S: 32.065,
  Cl: 35.453,
  Fe: 55.845,
  Zn: 65.38,
  B: 10.81,
  Mn: 54.938,
  Cu: 63.546,
  Mo: 95.95,
};

export function createEmptySolutionElements(): SolutionElements {
  return Object.fromEntries(elementOrder.map((key) => [key, 0])) as SolutionElements;
}

export function solutionElementsFromRecord(record: Partial<Record<ElementKey, number>>): SolutionElements {
  const result = createEmptySolutionElements();
  for (const key of elementOrder) {
    result[key] = record[key] ?? 0;
  }
  return result;
}

export function computeSolutionRatio(elements: SolutionElements): SolutionRatio {
  const nh4 = elements.NH4;
  const no3 = elements.NO3;
  const n = nh4 + no3;
  const k = elements.K;
  const ca = elements.Ca;
  const mg = elements.Mg;

  return {
    nh4Percent: safeDivide(100 * nh4, n),
    nk: safeDivide(n, k),
    kca: safeDivide(k, ca),
    kmg: safeDivide(k, mg),
    camg: safeDivide(ca, mg),
  };
}

export function computeSolutionEc(elements: SolutionElements): SolutionEc {
  const cations =
    toMillimoles("NH4", elements.NH4) +
    toMillimoles("K", elements.K) +
    2 * toMillimoles("Ca", elements.Ca) +
    2 * toMillimoles("Mg", elements.Mg);

  const anions =
    -toMillimoles("NO3", elements.NO3) -
    2 * toMillimoles("S", elements.S) -
    toMillimoles("P", elements.P) -
    toMillimoles("Cl", elements.Cl);

  return {
    cations,
    anions,
    deltaCa: anions + cations,
    ec: 0.095 * -anions + 0.19,
  };
}

export function computeElementsFromDoses(fertilizers: FertilizerInput[], doses: number[]): SolutionElements {
  const result = createEmptySolutionElements();

  for (let index = 0; index < fertilizers.length; index += 1) {
    const fertilizer = fertilizers[index];
    const dose = doses[index] ?? 0;
    if (dose <= 0) {
      continue;
    }

    const explicitNo3 = fertilizer.elements.NO3 ?? 0;
    const explicitNh4 = fertilizer.elements.NH4 ?? 0;
    if (explicitNo3 > 0 || explicitNh4 > 0) {
      result.NO3 += explicitNo3 * dose;
      result.NH4 += explicitNh4 * dose;
    } else {
      const nitrogenTotal = fertilizer.elements.N ?? 0;
      const nitrogenSplit = inferNitrogenSplit(fertilizer.name);
      result.NO3 += nitrogenTotal * dose * nitrogenSplit.no3;
      result.NH4 += nitrogenTotal * dose * nitrogenSplit.nh4;
    }
    result.P += (fertilizer.elements.P ?? 0) * dose;
    result.K += (fertilizer.elements.K ?? 0) * dose;
    result.Ca += (fertilizer.elements.Ca ?? 0) * dose;
    result.Mg += (fertilizer.elements.Mg ?? 0) * dose;
    result.S += (fertilizer.elements.S ?? 0) * dose;
  }

  return result;
}

export function solveRecipe(targetElements: SolutionElements, fertilizers: FertilizerInput[]): SolveResult {
  if (fertilizers.length === 0) {
    return buildSolveResult(targetElements, fertilizers, []);
  }

  const activeElements = elementOrder.filter((key) => targetElements[key] > 0 || fertilizers.some((fertilizer) => fertilizerContribution(fertilizer, key) > 0));
  if (activeElements.length === 0) {
    return buildSolveResult(targetElements, fertilizers, new Array<number>(fertilizers.length).fill(0));
  }

  const matrix = createSquareMatrix(fertilizers.length);
  const vector = new Array<number>(fertilizers.length).fill(0);

  for (let row = 0; row < fertilizers.length; row += 1) {
    for (let col = 0; col < fertilizers.length; col += 1) {
      let sum = 0;
      for (const key of activeElements) {
        const weight = 1 / Math.max(targetElements[key], 1);
        sum += fertilizerContribution(fertilizers[row], key) * fertilizerContribution(fertilizers[col], key) * weight;
      }
      matrix[row][col] = sum + (row === col ? 1e-9 : 0);
    }

    for (const key of activeElements) {
      const weight = 1 / Math.max(targetElements[key], 1);
      vector[row] += targetElements[key] * fertilizerContribution(fertilizers[row], key) * weight;
    }
  }

  const doses = solveNonNegativeSystem(matrix, vector);
  return buildSolveResult(targetElements, fertilizers, doses);
}

function buildSolveResult(targetElements: SolutionElements, fertilizers: FertilizerInput[], doses: number[]): SolveResult {
  const paddedDoses = fertilizers.map((_, index) => clampNonNegative(doses[index] ?? 0));
  const mixedElements = computeElementsFromDoses(fertilizers, paddedDoses);
  const residual = Math.sqrt(
    elementOrder.reduce((sum, key) => {
      const delta = mixedElements[key] - targetElements[key];
      return sum + delta * delta;
    }, 0),
  );
  const totalCostPerLiter = fertilizers.reduce((sum, fertilizer, index) => sum + clampNonNegative(paddedDoses[index]) * fertilizer.cost, 0);

  return {
    doses: paddedDoses,
    mixedElements,
    residual,
    totalCostPerLiter,
    targetRatio: computeSolutionRatio(targetElements),
    mixRatio: computeSolutionRatio(mixedElements),
    targetEc: computeSolutionEc(targetElements),
    mixEc: computeSolutionEc(mixedElements),
  };
}

function fertilizerContribution(fertilizer: FertilizerInput, key: ElementKey): number {
  switch (key) {
    case "NO3":
      if ((fertilizer.elements.NO3 ?? 0) > 0 || (fertilizer.elements.NH4 ?? 0) > 0) {
        return fertilizer.elements.NO3 ?? 0;
      }
      return (fertilizer.elements.N ?? 0) * inferNitrogenSplit(fertilizer.name).no3;
    case "NH4":
      if ((fertilizer.elements.NO3 ?? 0) > 0 || (fertilizer.elements.NH4 ?? 0) > 0) {
        return fertilizer.elements.NH4 ?? 0;
      }
      return (fertilizer.elements.N ?? 0) * inferNitrogenSplit(fertilizer.name).nh4;
    case "P":
    case "K":
    case "Ca":
    case "Mg":
    case "S":
      return fertilizer.elements[key] ?? 0;
    default:
      return 0;
  }
}

function inferNitrogenSplit(name: string): { no3: number; nh4: number } {
  const normalized = name.toLowerCase();
  if (normalized.includes("ammonium") && normalized.includes("nitrate")) {
    return { no3: 0.5, nh4: 0.5 };
  }
  if (normalized.includes("ammonium")) {
    return { no3: 0, nh4: 1 };
  }
  if (normalized.includes("nitrate") || normalized.includes("masterblend")) {
    return { no3: 1, nh4: 0 };
  }
  return { no3: 0.88, nh4: 0.12 };
}

function toMillimoles(key: ElementKey, ppm: number): number {
  return ppm / atomicMassByElement[key];
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function createSquareMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function solveNonNegativeSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const active = new Array<boolean>(size).fill(false);
  const solution = new Array<number>(size).fill(0);
  const maxIterations = Math.max(10, size * 2);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const freeIndices = active.flatMap((isActive, index) => (isActive ? [] : [index]));
    if (freeIndices.length === 0) {
      return solution;
    }

    const reducedMatrix = createSquareMatrix(freeIndices.length);
    const reducedVector = new Array<number>(freeIndices.length).fill(0);

    for (let row = 0; row < freeIndices.length; row += 1) {
      reducedVector[row] = vector[freeIndices[row]];
      for (let col = 0; col < freeIndices.length; col += 1) {
        reducedMatrix[row][col] = matrix[freeIndices[row]][freeIndices[col]];
      }
      reducedMatrix[row][row] += 1e-9;
    }

    const reducedSolution = solvePositiveDefiniteSystem(reducedMatrix, reducedVector);
    let hasNegative = false;

    for (let index = 0; index < solution.length; index += 1) {
      solution[index] = 0;
    }

    for (let row = 0; row < freeIndices.length; row += 1) {
      const value = reducedSolution[row] ?? 0;
      solution[freeIndices[row]] = value;
      if (value < -1e-10) {
        hasNegative = true;
      }
    }

    if (!hasNegative) {
      return solution.map((value) => (value > 0 ? value : 0));
    }

    let fixedThisRound = false;
    for (const index of freeIndices) {
      if (solution[index] < 0) {
        active[index] = true;
        solution[index] = 0;
        fixedThisRound = true;
      }
    }

    if (!fixedThisRound) {
      return solution.map((value) => (value > 0 ? value : 0));
    }
  }

  return solution.map((value) => (value > 0 ? value : 0));
}

function solvePositiveDefiniteSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const lower = createSquareMatrix(size);

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      let sum = 0;
      if (row === col) {
        for (let index = 0; index < col; index += 1) {
          sum += lower[row][index] * lower[row][index];
        }
        lower[row][col] = Math.sqrt(Math.max(matrix[row][row] - sum, 1e-12));
      } else {
        for (let index = 0; index < col; index += 1) {
          sum += lower[row][index] * lower[col][index];
        }
        lower[row][col] = (matrix[row][col] - sum) / lower[col][col];
      }
    }
  }

  const intermediate = new Array<number>(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let sum = 0;
    for (let col = 0; col < row; col += 1) {
      sum += lower[row][col] * intermediate[col];
    }
    intermediate[row] = (vector[row] - sum) / lower[row][row];
  }

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = 0;
    for (let col = size - 1; col > row; col -= 1) {
      sum += lower[col][row] * solution[col];
    }
    solution[row] = (intermediate[row] - sum) / lower[row][row];
  }

  return solution;
}