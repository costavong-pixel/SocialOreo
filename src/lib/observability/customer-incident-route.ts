export const CUSTOMER_INCIDENT_ROUTES = [
  "/home",
  "/dashboard",
  "/posts",
  "/watch",
  "/calendar",
  "/connections",
  "/credits",
  "/analysis",
  "/assistant",
  "/settings",
  "/unknown",
] as const;

export type CustomerIncidentRoute = (typeof CUSTOMER_INCIDENT_ROUTES)[number];

const UNKNOWN_CUSTOMER_INCIDENT_ROUTE: CustomerIncidentRoute = "/unknown";
const SAFE_TOP_LEVEL_ROUTE_SEGMENTS = new Set(
  CUSTOMER_INCIDENT_ROUTES.map((value) => value.slice(1)),
);

export function normalizeCustomerIncidentRoute(value: string | undefined | null): CustomerIncidentRoute {
  if (typeof value !== "string") {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  const pathname = trimmed.split("?")[0];
  if (!pathname.startsWith("/")) {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  const firstSegment = pathname.split("/")[1] ?? "";
  if (!firstSegment) {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  let segment = firstSegment;
  try {
    segment = decodeURIComponent(firstSegment);
  } catch {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  if (!/^[A-Za-z0-9._-]+$/.test(segment)) {
    return UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
  }

  return SAFE_TOP_LEVEL_ROUTE_SEGMENTS.has(segment)
    ? (`/${segment}` as CustomerIncidentRoute)
    : UNKNOWN_CUSTOMER_INCIDENT_ROUTE;
}
