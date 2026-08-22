export const TEST_DESK_ID = "WQ3137";
export const TEST_DESK_EMAIL = "wq3137@meridian.local";

export function emailFromDeskId(id: string) {
  const t = id.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  if (t.toUpperCase() === TEST_DESK_ID) return TEST_DESK_EMAIL;
  return `${t.toLowerCase()}@meridian.local`;
}
