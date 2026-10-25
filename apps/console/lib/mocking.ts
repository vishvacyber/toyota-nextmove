/**
 * Which MSW handler paths stay mocked. Same syntax as the shared `NEXT_PUBLIC_API_MOCKING` switch ("enabled",
 * "disabled", or comma path prefixes), plus a trailing `$` for an exact path, so `/customers$` mocks the list
 * without also mocking the live `/customers/:id/recommendation`.
 */
export function mocked(path: string, setting = "enabled") {
  if (setting === "enabled") return true;
  if (setting === "disabled") return false;
  return setting.split(",").map((s) => s.trim()).filter(Boolean)
    .some((p) => (p.endsWith("$") ? path === p.slice(0, -1) : path.startsWith(p)));
}
