export type SemesterOption = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

function getYmdParts(dateText: string) {
  const [y, m, d] = dateText.split("-").map(Number);
  if (!y || !m || !d) {
    return null;
  }
  return { y, m, d };
}

function buildSemesterOption(startYear: number, semester: 1 | 2): SemesterOption {
  const endYear = startYear + 1;
  const startDate = semester === 1 ? `${startYear}-08-15` : `${endYear}-02-16`;
  const endDate = semester === 1 ? `${endYear}-02-15` : `${endYear}-08-14`;

  return {
    id: `${startYear}-${endYear}-${semester}`,
    label: `${startYear}-${endYear}-${semester}学期`,
    startDate,
    endDate,
  };
}

function inferAcademicStartYearByDate(dateText: string): number {
  const parts = getYmdParts(dateText);
  if (!parts) return new Date().getFullYear();

  const { y, m, d } = parts;
  const monthDay = m * 100 + d;
  if (monthDay >= 815) return y;
  return y - 1;
}

export function buildSemesterOptionsFromYears(minAcademicStartYear: number, maxAcademicStartYear: number): SemesterOption[] {
  const options: SemesterOption[] = [];
  for (let startYear = maxAcademicStartYear; startYear >= minAcademicStartYear; startYear -= 1) {
    options.push(buildSemesterOption(startYear, 1));
    options.push(buildSemesterOption(startYear, 2));
  }
  return options;
}

export function deriveSemesterOptionsFromDateStrings(dateTexts: string[]): SemesterOption[] {
  const currentYear = new Date().getFullYear();
  if (dateTexts.length === 0) {
    return buildSemesterOptionsFromYears(currentYear - 2, currentYear + 1);
  }

  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;

  for (const dateText of dateTexts) {
    const y = inferAcademicStartYearByDate(dateText);
    minYear = Math.min(minYear, y);
    maxYear = Math.max(maxYear, y);
  }

  return buildSemesterOptionsFromYears(minYear - 1, maxYear + 1);
}

export function findSemesterOption(options: SemesterOption[], semesterId: string) {
  return options.find((option) => option.id === semesterId);
}

export function monthToDate(monthText: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthText)) {
    return "";
  }
  return `${monthText}-01`;
}

export function isDateInRange(dateText: string, startDate: string, endDate: string) {
  if (!dateText) return false;
  return dateText >= startDate && dateText <= endDate;
}
