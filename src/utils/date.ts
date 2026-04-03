import { format, subMonths, startOfQuarter, endOfQuarter, parse } from "date-fns";

export function parseDateRange(input: string): { from: string; to: string } {
  const now = new Date();

  // "last N months"
  const lastMonthsMatch = input.match(/last\s+(\d+)\s+months?/i);
  if (lastMonthsMatch) {
    const months = parseInt(lastMonthsMatch[1]);
    return {
      from: format(subMonths(now, months), "yyyy-MM-dd"),
      to: format(now, "yyyy-MM-dd"),
    };
  }

  // "Q1 2026" etc
  const quarterMatch = input.match(/Q([1-4])\s+(\d{4})/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1]);
    const year = parseInt(quarterMatch[2]);
    const quarterDate = new Date(year, (quarter - 1) * 3, 1);
    return {
      from: format(startOfQuarter(quarterDate), "yyyy-MM-dd"),
      to: format(endOfQuarter(quarterDate), "yyyy-MM-dd"),
    };
  }

  // "H1 2026" / "H2 2026"
  const halfMatch = input.match(/H([12])\s+(\d{4})/i);
  if (halfMatch) {
    const half = parseInt(halfMatch[1]);
    const year = parseInt(halfMatch[2]);
    return {
      from: `${year}-${half === 1 ? "01" : "07"}-01`,
      to: `${year}-${half === 1 ? "06" : "12"}-31`,
    };
  }

  // "Oct 2025 - Mar 2026" or "October 2025 - March 2026"
  const rangeMatch = input.match(
    /(\w+)\s+(\d{4})\s*[-–to]+\s*(\w+)\s+(\d{4})/i,
  );
  if (rangeMatch) {
    const fromDate = parse(
      `${rangeMatch[1]} ${rangeMatch[2]}`,
      "MMM yyyy",
      now,
    );
    const toDate = parse(
      `${rangeMatch[3]} ${rangeMatch[4]}`,
      "MMM yyyy",
      now,
    );
    if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
      return {
        from: format(fromDate, "yyyy-MM-dd"),
        to: format(endOfQuarter(toDate), "yyyy-MM-dd"),
      };
    }
  }

  // "2025-10-01 to 2026-03-31" (ISO dates)
  const isoMatch = input.match(
    /(\d{4}-\d{2}-\d{2})\s*[-–to]+\s*(\d{4}-\d{2}-\d{2})/,
  );
  if (isoMatch) {
    return { from: isoMatch[1], to: isoMatch[2] };
  }

  // Default: last 6 months
  return {
    from: format(subMonths(now, 6), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}
