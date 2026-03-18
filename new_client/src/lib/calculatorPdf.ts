import { elementOrder, type ElementKey, type SolutionRatio } from "./calculatorEngine";
import { type FertilizerBottle, type FertilizerType } from "@rpc/nscalc";

export type CalculatorReportRow = {
  name: string;
  bottle: FertilizerBottle;
  type: FertilizerType;
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

const bottleLabels = ["Tank A", "Tank B", "Tank C"] as const;
const bottleColors = {
  0: { fill: [234, 208, 162], stroke: [179, 144, 91], text: [69, 48, 20] },
  1: { fill: [110, 231, 183], stroke: [20, 83, 45], text: [6, 78, 59] },
  2: { fill: [253, 164, 175], stroke: [136, 19, 55], text: [136, 19, 55] },
} as const;

type TableColumn = {
  key: string;
  header: string;
  width: number;
  align?: "left" | "right" | "center";
};

type TableRow = Record<string, string>;

export function buildCalculatorReport(input: CalculatorReportInput): string {
  const lines: string[] = [];

  lines.push(`Solution  : ${input.solutionName}`);
  lines.push(`Volume    : ${formatNumber(input.volumeLiters)} L`);
  lines.push("");
  lines.push("Selected fertilizers:");

  for (let bottle = 0 as FertilizerBottle; bottle <= 2; bottle += 1) {
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

export async function saveCalculatorReportPdf(input: CalculatorReportInput, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;
  const lineHeight = 13;
  const contentWidth = pageWidth - margin * 2;

  let cursorY = margin;

  const setFill = (rgb: readonly number[]) => document.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setStroke = (rgb: readonly number[]) => document.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const setText = (rgb: readonly number[]) => document.setTextColor(rgb[0], rgb[1], rgb[2]);

  const addPage = (): void => {
    document.addPage();
    cursorY = margin;
  };

  const ensureSpace = (height: number): void => {
    if (cursorY + height <= pageHeight - margin) {
      return;
    }
    addPage();
  };

  const drawSectionTitle = (title: string, subtitle?: string): void => {
    ensureSpace(subtitle ? 34 : 24);
    document.setFont("helvetica", "bold");
    document.setFontSize(12);
    setText([20, 46, 72]);
    document.text(title, margin, cursorY);
    cursorY += 16;
    if (subtitle) {
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      setText([94, 123, 148]);
      document.text(subtitle, margin, cursorY);
      cursorY += 14;
    }
  };

  const drawInfoCards = (cards: Array<{ label: string; value: string }>): void => {
    const columns = 2;
    const gap = 12;
    const cardWidth = (contentWidth - gap) / columns;
    const cardHeight = 52;
    const rows = Math.ceil(cards.length / columns);
    ensureSpace(rows * cardHeight + (rows - 1) * gap + 8);

    cards.forEach((card, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (cardWidth + gap);
      const y = cursorY + row * (cardHeight + gap);
      setFill([239, 247, 255]);
      setStroke([191, 219, 254]);
      document.roundedRect(x, y, cardWidth, cardHeight, 12, 12, "FD");
      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      setText([94, 123, 148]);
      document.text(card.label.toUpperCase(), x + 12, y + 16);
      document.setFont("helvetica", "bold");
      document.setFontSize(13);
      setText([20, 46, 72]);
      document.text(card.value, x + 12, y + 35);
    });

    cursorY += rows * cardHeight + (rows - 1) * gap;
  };

  const drawBottleBand = (bottle: FertilizerBottle): void => {
    const colors = bottleColors[bottle];
    ensureSpace(24);
    setFill(colors.fill);
    setStroke(colors.stroke);
    document.roundedRect(margin, cursorY, contentWidth, 20, 10, 10, "FD");
    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    setText(colors.text);
    document.text(bottleLabels[bottle], margin + 12, cursorY + 13);
    cursorY += 28;
  };

  const drawTable = (columns: TableColumn[], rows: TableRow[]): void => {
    const headerHeight = 22;
    const cellPaddingX = 8;
    const cellPaddingY = 7;

    const drawCell = (
      x: number,
      y: number,
      width: number,
      height: number,
      text: string,
      options: {
        align: "left" | "right" | "center";
        fill: readonly number[];
        stroke: readonly number[];
        textColor: readonly number[];
        font: "normal" | "bold";
        fontSize: number;
      },
    ): void => {
      setFill(options.fill);
      setStroke(options.stroke);
      document.rect(x, y, width, height, "FD");
      document.setFont("helvetica", options.font);
      document.setFontSize(options.fontSize);
      setText(options.textColor);

      const maxWidth = width - cellPaddingX * 2;
      const lines = document.splitTextToSize(text || "-", maxWidth);
      const startY = y + cellPaddingY + 8;
      lines.forEach((line: string, index: number) => {
        const textWidth = document.getTextWidth(line);
        if (options.align === "right") {
          document.text(line, x + width - cellPaddingX - textWidth, startY + index * lineHeight);
          return;
        }
        if (options.align === "center") {
          document.text(line, x + (width - textWidth) / 2, startY + index * lineHeight);
          return;
        }
        document.text(line, x + cellPaddingX, startY + index * lineHeight);
      });
    };

    const drawHeader = (): void => {
      ensureSpace(headerHeight);
      let x = margin;
      for (const column of columns) {
        drawCell(x, cursorY, column.width, headerHeight, column.header, {
          align: column.align ?? "left",
          fill: [20, 46, 72],
          stroke: [20, 46, 72],
          textColor: [255, 255, 255],
          font: "bold",
          fontSize: 8,
        });
        x += column.width;
      }
      cursorY += headerHeight;
    };

    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cellLines = columns.map((column) => document.splitTextToSize(row[column.key] || "-", column.width - cellPaddingX * 2));
      const rowHeight = Math.max(24, ...cellLines.map((lines) => lines.length * lineHeight + cellPaddingY * 2 - 2));
      ensureSpace(rowHeight);
      if (cursorY === margin) {
        drawHeader();
      }

      let x = margin;
      const fill = rowIndex % 2 === 0 ? [247, 250, 252] as const : [239, 247, 255] as const;
      const stroke = [209, 223, 237] as const;
      const textColor = [31, 41, 55] as const;
      for (const column of columns) {
        drawCell(x, cursorY, column.width, rowHeight, row[column.key] || "-", {
          align: column.align ?? "left",
          fill,
          stroke,
          textColor,
          font: "normal",
          fontSize: 9,
        });
        x += column.width;
      }
      cursorY += rowHeight;
    });
  };

  const fertilizerRows = input.rows
    .filter((row) => row.gramsPerLiter > 0)
    .sort((left, right) => left.bottle - right.bottle || left.name.localeCompare(right.name));
  const metricRows = input.metrics.filter((metric) => Math.abs(metric.target) >= 0.001 || Math.abs(metric.mixed) >= 0.001);

  setFill([245, 250, 255]);
  document.rect(0, 0, pageWidth, pageHeight, "F");
  setFill([13, 42, 64]);
  document.rect(0, 0, pageWidth, 96, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(22);
  setText([255, 255, 255]);
  document.text("NScalc Recipe Report", margin, 44);
  document.setFont("helvetica", "normal");
  document.setFontSize(11);
  setText([220, 239, 255]);
  document.text(input.solutionName, margin, 64);
  document.text(`Volume ${formatNumber(input.volumeLiters)} L`, margin, 80);

  cursorY = 116;
  drawInfoCards([
    { label: "Total PPM", value: formatFixed(input.totalMixed) },
    { label: "Delta", value: `${formatSigned(percentDelta(input.totalMixed, input.totalTarget))} %` },
    { label: "NH4 share", value: `${formatFixed(input.ratio.nh4Percent)} %` },
    { label: "Estimated cost", value: formatFixed(input.estimatedCost) },
  ]);
  cursorY += 18;

  drawSectionTitle("Selected fertilizers", "Grouped by stock bottle for mixing.");
  for (let bottle = 0 as FertilizerBottle; bottle <= 2; bottle += 1) {
    const bottleRows = fertilizerRows.filter((row) => row.bottle === bottle);
    if (bottleRows.length === 0) {
      continue;
    }
    drawBottleBand(bottle);
    drawTable(
      [
        { key: "name", header: "Fertilizer", width: 228 },
        { key: "dose", header: "Dose", width: 88, align: "right" },
        { key: "tank", header: "Tank mass", width: 88, align: "right" },
        { key: "type", header: "Type", width: 70, align: "center" },
      ],
      bottleRows.map((row) => ({
        name: row.name,
        dose: `${formatFixed(row.gramsPerLiter)} g/L`,
        tank: formatDoseAmount(row),
        type: row.type === 0 ? "Dry" : row.type === 1 ? "Liquid" : "Solution",
      })),
    );
    cursorY += 12;
  }

  drawSectionTitle("Nutrient outcome", "Target, mixed result, and percentage deviation.");
  drawTable(
    [
      { key: "nutrient", header: "Nutrient", width: 108 },
      { key: "target", header: "Target", width: 92, align: "right" },
      { key: "mixed", header: "Mixed", width: 92, align: "right" },
      { key: "delta", header: "Delta", width: 92, align: "right" },
      { key: "percent", header: "%", width: 92, align: "right" },
      { key: "status", header: "Status", width: 70, align: "center" },
    ],
    metricRows.map((metric) => ({
      nutrient: nutrientLabels[metric.key],
      target: formatFixed(metric.target),
      mixed: formatFixed(metric.mixed),
      delta: formatSigned(metric.delta),
      percent: Math.abs(metric.target) > 0.001 ? `${formatSigned((metric.delta / metric.target) * 100)} %` : "-",
      status: Math.abs(metric.delta) <= 0.5 ? "On target" : metric.delta > 0 ? "High" : "Low",
    })),
  );
  cursorY += 12;

  drawSectionTitle("Ratios", "Macronutrient relationships for quick review.");
  drawInfoCards([
    { label: "N:K", value: formatFixed(input.ratio.nk) },
    { label: "K:Ca", value: formatFixed(input.ratio.kca) },
    { label: "K:Mg", value: formatFixed(input.ratio.kmg) },
    { label: "Ca:Mg", value: formatFixed(input.ratio.camg) },
  ]);

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