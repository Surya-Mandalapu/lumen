export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export const hours = (value: number) => `${value.toFixed(1)} h`;
export const coordinate = (latitude: number, longitude: number) =>
  `${Math.abs(latitude).toFixed(3)}°S · ${Math.abs(longitude).toFixed(3)}°${longitude < 0 ? "W" : "E"}`;
export const utcDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const utcTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTimelineCsv(
  rows: Record<string, unknown>[],
  filename: string,
) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csvCell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    keys.map(csvCell).join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
