/** Formatting helpers usable from server and client components. */
export const fmtUsd = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;
export const fmtSec = (s: number | null | undefined) => {
  const v = Math.round(s ?? 0);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
