import { isValidIanaTimeZone } from "./water-temperature";

/**
 * Thrown when the configured organization operational timezone (see
 * `config.operationalTimeZone` and KTD2 in the daily water-temperature
 * checks plan) is missing or not a timezone the runtime recognizes. Callers
 * must fail clock-in/classification visibly rather than silently falling
 * back to the browser locale or database host timezone.
 */
export class InvalidOperationalTimeZoneError extends Error {
  constructor(timeZone: unknown) {
    super(
      `Invalid or missing organization operational time zone: ${JSON.stringify(
        timeZone,
      )}. Contact an administrator to configure a valid IANA timezone.`,
    );
    this.name = "InvalidOperationalTimeZoneError";
  }
}

/**
 * Derives the organization-local calendar date (`YYYY-MM-DD`) for a given
 * instant, using the supplied IANA timezone identifier.
 *
 * This is the single source of truth for freezing a shift/water-temperature
 * check's `operationalDate` (see KTD2): it must be computed from the
 * canonical organization timezone at the moment of the instant, not from
 * the browser's locale or the database host's timezone, so that an
 * overnight shift (e.g. a 3rd-shift clock-in at 11:30 PM) keeps its start
 * date and daylight-saving transitions are handled correctly.
 *
 * Uses `Intl.DateTimeFormat` with the `timeZone` option (via
 * `formatToParts`) rather than hand-rolled UTC offset arithmetic, so DST
 * transitions and historical offset changes are handled by the runtime's
 * timezone database.
 */
export function computeOperationalDate(instant: Date, timeZone: string): string {
  if (
    typeof timeZone !== "string" ||
    !isValidIanaTimeZone(timeZone) ||
    !Number.isFinite(instant?.getTime?.())
  ) {
    throw new InvalidOperationalTimeZoneError(timeZone);
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(instant);
  const lookup = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;

  const year = lookup("year");
  const month = lookup("month");
  const day = lookup("day");

  if (!year || !month || !day) {
    throw new InvalidOperationalTimeZoneError(timeZone);
  }

  return `${year}-${month}-${day}`;
}
