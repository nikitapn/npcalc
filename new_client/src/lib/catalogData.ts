import type { Fertilizer, Solution, FertilizerBottle } from "@rpc/nscalc";
import { computeSolutionEc, computeSolutionRatio, solutionElementsFromRecord, type ElementKey } from "./calculatorEngine";

export type SolutionCardData = {
  id: number;
  name: string;
  author: string;
  rawElements: Record<ElementKey, number>;
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
  formula: string;
  bottle: FertilizerBottle;
  elements: Record<string, string>;
};

const solutionElementLabels: ElementKey[] = ["NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];
const fertilizerElementLabels: ElementKey[] = ["NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];

export function solutionCardFromRpc(solution: Solution): SolutionCardData {
  const solutionElements = solutionElementsFromRecord({
    NO3: solution.elements[0] ?? 0,
    NH4: solution.elements[1] ?? 0,
    P: solution.elements[2] ?? 0,
    K: solution.elements[3] ?? 0,
    Ca: solution.elements[4] ?? 0,
    Mg: solution.elements[5] ?? 0,
    S: solution.elements[6] ?? 0,
    Cl: solution.elements[7] ?? 0,
    Fe: solution.elements[8] ?? 0,
    Zn: solution.elements[9] ?? 0,
    B: solution.elements[10] ?? 0,
    Mn: solution.elements[11] ?? 0,
    Cu: solution.elements[12] ?? 0,
    Mo: solution.elements[13] ?? 0,
  });
  const ratios = computeSolutionRatio(solutionElements);
  const ec = computeSolutionEc(solutionElements);

  return {
    id: solution.id,
    name: solution.name,
    author: solution.userName,
    rawElements: solutionElements,
    elements: Object.fromEntries(
      solutionElementLabels.map((label) => [label, formatSolutionElement(label, solutionElements[label] ?? 0)]),
    ) as Record<string, number>,
    ratios: {
      NH4Percent: ratios.nh4Percent.toFixed(1),
      NK: ratios.nk.toFixed(2),
      KCa: ratios.kca.toFixed(2),
      KMg: ratios.kmg.toFixed(2),
      CaMg: ratios.camg.toFixed(2),
      delta: ec.deltaCa.toFixed(2),
      EC: ec.ec.toFixed(2),
    },
  };
}

export function fertilizerCardFromRpc(fertilizer: Fertilizer): FertilizerCardData {
  const fertilizerElements = {
    NO3: fertilizer.elements[0] ?? 0,
    NH4: fertilizer.elements[1] ?? 0,
    P: fertilizer.elements[2] ?? 0,
    K: fertilizer.elements[3] ?? 0,
    Ca: fertilizer.elements[4] ?? 0,
    Mg: fertilizer.elements[5] ?? 0,
    S: fertilizer.elements[6] ?? 0,
    Cl: fertilizer.elements[7] ?? 0,
    Fe: fertilizer.elements[8] ?? 0,
    Zn: fertilizer.elements[9] ?? 0,
    B: fertilizer.elements[10] ?? 0,
    Mn: fertilizer.elements[11] ?? 0,
    Cu: fertilizer.elements[12] ?? 0,
    Mo: fertilizer.elements[13] ?? 0,
  } satisfies Record<ElementKey, number>;

  return {
    id: fertilizer.id,
    name: fertilizer.name,
    author: fertilizer.userName,
    cost: fertilizer.cost.toFixed(2),
    formula: fertilizer.formula,
    bottle: fertilizer.bottle,
    elements: Object.fromEntries(
      fertilizerElementLabels
        .filter((label) => Number(fertilizerElements[label].toFixed(2)) !== 0)
        .map((label) => [label, fertilizerElements[label].toFixed(2)]),
    ) as Record<string, string>,
  };
}

function formatSolutionElement(key: ElementKey, value: number): number {
  if (["Fe", "Zn", "B", "Mn", "Cu", "Mo"].includes(key)) {
    return Number(value.toFixed(2));
  }
  return Number(value.toFixed(0));
}