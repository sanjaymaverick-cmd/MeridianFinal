import path from "node:path";

/**
 * Paper samples, heartbeat, and meta artefact.
 * The Windows build sets MERIDIAN_DATA_DIR to %APPDATA%\Meridian Final\data
 * so a reinstall does not wipe the book. Unset → ./data under cwd (run.bat).
 */
export function meridianDataDir(): string {
  const fromEnv = process.env.MERIDIAN_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data");
}
