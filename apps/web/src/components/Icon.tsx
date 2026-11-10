import type { CSSProperties } from "react";
const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  play: "m8 5 11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  earth:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18",
  terrain: "m2 19 7-13 5 8 3-5 5 10H2Zm5-9 2 3 2-3",
  pin: "m12 22 0-6m-6-2h12l-3-4V3H9v7l-3 4Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  compare: "M4 4h6v16H4V4Zm10 0h6v16h-6V4Z",
  info: "M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  reset: "M3 11a9 9 0 1 1 2 7M3 4v7h7",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  layers: "m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5",
  compass: "M16 8 13 13 8 16 11 11 16 8Z M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
