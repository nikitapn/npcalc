import type { FertilizerCardData, SolutionCardData } from "./catalogData";

type SolutionsViewState = {
  ready: boolean;
  search: string;
  author: string;
  items: SolutionCardData[];
  nextCursor: string | null;
};

type FertilizersViewState = {
  ready: boolean;
  search: string;
  items: FertilizerCardData[];
  nextCursor: string | null;
};

let solutionsViewState: SolutionsViewState = {
  ready: false,
  search: "",
  author: "",
  items: [],
  nextCursor: null,
};

let fertilizersViewState: FertilizersViewState = {
  ready: false,
  search: "",
  items: [],
  nextCursor: null,
};

export function getSolutionsViewState(): SolutionsViewState {
  return {
    ...solutionsViewState,
    items: [...solutionsViewState.items],
  };
}

export function setSolutionsViewState(nextState: SolutionsViewState): void {
  solutionsViewState = {
    ...nextState,
    items: [...nextState.items],
  };
}

export function getFertilizersViewState(): FertilizersViewState {
  return {
    ...fertilizersViewState,
    items: [...fertilizersViewState.items],
  };
}

export function setFertilizersViewState(nextState: FertilizersViewState): void {
  fertilizersViewState = {
    ...nextState,
    items: [...nextState.items],
  };
}