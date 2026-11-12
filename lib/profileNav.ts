/** Only same-origin relative paths are accepted as a post-save destination (no open redirects). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 200) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[^\x20-\x7e]/.test(raw)) return "/";
  return raw;
}

const WRITE_PREFIXES = ["/apply", "/founder", "/launches", "/p2p", "/admin", "/portfolio", "/projects/create"];
const MILESTONES_ROUTE = /^\/projects\/[^/]+\/milestones(\/|$)/;
const PROJECT_ROUTE = /^\/projects\/[^/]+\/?$/;

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isWriteRoute(pathname: string): boolean {
  return WRITE_PREFIXES.some((p) => underPrefix(pathname, p)) || MILESTONES_ROUTE.test(pathname);
}

export function isPublicReadRoute(pathname: string): boolean {
  return pathname === "/" || (PROJECT_ROUTE.test(pathname) && !underPrefix(pathname, "/projects/create"));
}
