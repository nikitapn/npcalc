import { elementOrder, type ElementKey, type SolutionRatio } from "./calculatorEngine";

type FertilizerBottleCode = 0 | 1 | 2;
type FertilizerTypeCode = 0 | 1 | 2;

export type CalculatorReportRow = {
  name: string;
  bottle: FertilizerBottleCode;
  type: FertilizerTypeCode;
  density: number;
  gramsPerLiter: number;
  totalGrams: number;
};

export type CalculatorReportMetric = {
  key: ElementKey;
  target: number;
  mixed: number;
  delta: number;
};

export type CalculatorReportInput = {
  solutionName: string;
  volumeLiters: number;
  rows: CalculatorReportRow[];
  metrics: CalculatorReportMetric[];
  totalTarget: number;
  totalMixed: number;
  ratio: SolutionRatio;
  estimatedCost: number;
};

const nutrientLabels: Record<ElementKey, string> = {
  NO3: "N-NO3",
  NH4: "N-NH4",
  P: "P",
  K: "K",
  Ca: "Ca",
  Mg: "Mg",
  S: "S",
  Cl: "Cl",
  Fe: "Fe",
  Zn: "Zn",
  B: "B",
  Mn: "Mn",
  Cu: "Cu",
  Mo: "Mo",
};

const bottleLabels = ["Bottle A", "Bottle B", "Bottle C"] as const;

export function buildCalculatorReport(input: CalculatorReportInput): string {
  const lines: string[] = [];

  lines.push(`Solution  : ${input.solutionName}`);
  lines.push(`Volume    : ${formatNumber(input.volumeLiters)} L`);
  lines.push("");
  lines.push("Selected fertilizers:");

  for (let bottle = 0 as FertilizerBottleCode; bottle <= 2; bottle += 1) {
    const bottleRows = input.rows.filter((row) => row.bottle === bottle && row.gramsPerLiter > 0);
    if (bottleRows.length === 0) {
      continue;
    }

    lines.push(`${bottleLabels[bottle]}:`);
    for (const row of bottleRows) {
      lines.push(`${formatDoseAmount(row).padEnd(12)} - ${row.name}`);
    }
  }

  lines.push("");
  lines.push("Solution:");

  for (const key of elementOrder) {
    const metric = input.metrics.find((entry) => entry.key === key);
    if (!metric) {
      continue;
    }
    if (Math.abs(metric.target) < 0.001 && Math.abs(metric.mixed) < 0.001) {
      continue;
    }

    const label = nutrientLabels[key].padEnd(7);
    const mixed = formatFixed(metric.mixed).padStart(7);
    const percentDelta = Math.abs(metric.target) > 0.001
      ? `${formatSigned((metric.delta / metric.target) * 100).padStart(7)}  %`
      : "";
    lines.push(`${label} : ${mixed}${percentDelta ? ` : ${percentDelta}` : ""}`);
  }

  lines.push("");
  lines.push(`PPM     : ${formatFixed(input.totalMixed).padStart(7)} : ${formatSigned(percentDelta(input.totalMixed, input.totalTarget)).padStart(7)}  %`);
  lines.push("");
  lines.push(`N-NH4 % : ${formatFixed(input.ratio.nh4Percent)}`);
  lines.push(`N:K     : ${formatFixed(input.ratio.nk)}`);
  lines.push(`K:Ca    : ${formatFixed(input.ratio.kca)}`);
  lines.push(`K:Mg    : ${formatFixed(input.ratio.kmg)}`);
  lines.push(`Ca:Mg   : ${formatFixed(input.ratio.camg)}`);
  lines.push("");
  lines.push(`Cost    : ${formatFixed(input.estimatedCost)}`);

  return lines.join("\n");
}

export async function saveCalculatorReportPdf(report: string, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 40;
  const lineHeight = 14;
  const contentWidth = pageWidth - margin * 2;

  document.setFont("courier", "normal");
  document.setFontSize(10);

  let cursorY = margin;
  const lines = report.split("\n");

  for (const rawLine of lines) {
    const wrapped = rawLine.length === 0 ? [""] : document.splitTextToSize(rawLine, contentWidth);
    for (const line of wrapped) {
      if (cursorY > pageHeight - margin) {
        document.addPage();
        document.setFont("courier", "normal");
        document.setFontSize(10);
        cursorY = margin;
      }
      document.text(line, margin, cursorY);
      cursorY += lineHeight;
    }
  }

  document.save(sanitizeFilename(filename));
}

function formatDoseAmount(row: CalculatorReportRow): string {
  if (row.type === 0) {
    return `${formatFixed(row.totalGrams)} g`;
  }

  const density = row.density > 0 ? row.density : 1;
  return `${formatFixed(row.totalGrams / density)} ml`;
}

function formatFixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100) / 100}` : "0";
}

function formatSigned(value: number): string {
  const rounded = Number.isFinite(value) ? value : 0;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function percentDelta(mixed: number, target: number): number {
  if (Math.abs(target) < 0.001) {
    return 0;
  }
  return ((mixed - target) / target) * 100;
}

function sanitizeFilename(filename: string): string {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe.length > 0 ? safe : "calculator-report.pdf";
}