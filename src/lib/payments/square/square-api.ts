import type { SquareEnv } from "./config";

/**
 * Hard floor for the Square Payments API version. Every environment must speak
 * at least this version; an operator downgrade below it would silently change
 * response shapes parsed by this module and must fail closed.
 */
export const SQUARE_API_VERSION_MIN = "2026-07-15";
export const SQUARE_API_VERSION_DEFAULT = SQUARE_API_VERSION_MIN;

const SQUARE_API_BASE_BY_ENV: Record<SquareEnv, string> = {
  sandbox: "https://connect.squareupsandbox.com",
  production: "https://connect.squareup.com",
};

export class SquareApiConfigError extends Error {
  constructor(message = "Invalid Square API configuration.") {
    super(message);
    this.name = "SquareApiConfigError";
  }
}

/**
 * API base URL selected as a PURE function of config.environment. Never
 * re-reads process.env.SQUARE_ENV, so the URL can never disagree with the
 * environment stamped on checkout rows. Unknown/missing -> throw (fail closed;
 * never silently default to sandbox).
 */
export function squareApiBaseUrl(environment: SquareEnv): string {
  const base = SQUARE_API_BASE_BY_ENV[environment];
  if (!base) throw new SquareApiConfigError(`unsupported square environment: ${environment}`);
  return base;
}

const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Square-Version header. Defaults to the floor SQUARE_API_VERSION_MIN; a
 * configured SQUARE_API_VERSION must be a real YYYY-MM-DD date at or above the
 * floor, otherwise the configuration fails closed.
 */
export function squareApiVersion(): string {
  const configured = process.env.SQUARE_API_VERSION?.trim();
  if (!configured) return SQUARE_API_VERSION_DEFAULT;
  if (!VERSION_PATTERN.test(configured)) {
    throw new SquareApiConfigError("invalid SQUARE_API_VERSION (expected YYYY-MM-DD)");
  }
  const date = new Date(`${configured}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new SquareApiConfigError(`invalid SQUARE_API_VERSION date: ${configured}`);
  }
  // Round-trip check: a day like 2027-02-30 rolls over instead of failing, so
  // verify the parsed UTC date actually matches the configured YYYY-MM-DD.
  if (!date.toISOString().startsWith(configured)) {
    throw new SquareApiConfigError(`invalid SQUARE_API_VERSION calendar date: ${configured}`);
  }
  if (configured < SQUARE_API_VERSION_MIN) {
    throw new SquareApiConfigError(`SQUARE_API_VERSION ${configured} is below the safe floor ${SQUARE_API_VERSION_MIN}`);
  }
  return configured;
}
