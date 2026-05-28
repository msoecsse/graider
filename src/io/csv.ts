export interface CsvRow {
  rowNumber: number;
  values: string[];
}

export interface CsvDocument {
  headers: string[];
  rows: CsvRow[];
}

const HEADER_ROW_NUMBER = 1;
const FIRST_DATA_ROW_NUMBER = 2;
const EMPTY_LINE_COUNT = 0;
const EMPTY_FIELD = "";
const COMMA = ",";
const QUOTE = '"';
const DOUBLE_QUOTE = '""';
const CARRIAGE_RETURN = "\r";
const NEWLINE_PATTERN = /\n/;

const stripCarriageReturn = (line: string): string =>
  line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -CARRIAGE_RETURN.length) : line;

// Minimal CSV parser for MVP roster files. It supports comma-separated fields,
// quoted fields, escaped double quotes, and trims surrounding cell whitespace.
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = EMPTY_FIELD;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? EMPTY_FIELD;
    const nextTwoCharacters = line.slice(index, index + DOUBLE_QUOTE.length);

    if (nextTwoCharacters === DOUBLE_QUOTE && inQuotes) {
      current += QUOTE;
      index += QUOTE.length;
    } else if (character === QUOTE) {
      inQuotes = !inQuotes;
    } else if (character === COMMA && !inQuotes) {
      fields.push(current.trim());
      current = EMPTY_FIELD;
    } else {
      current += character;
    }
  }

  fields.push(current.trim());

  return fields;
};

export const parseCsv = (content: string): CsvDocument => {
  const lines = content.split(NEWLINE_PATTERN).map(stripCarriageReturn);
  const nonEmptyLines = lines.filter((line) => line.trim().length > EMPTY_LINE_COUNT);
  const headerLine = nonEmptyLines[HEADER_ROW_NUMBER - HEADER_ROW_NUMBER] ?? EMPTY_FIELD;
  const dataLines = nonEmptyLines.slice(FIRST_DATA_ROW_NUMBER - HEADER_ROW_NUMBER);

  return {
    headers: parseCsvLine(headerLine),
    rows: dataLines.map((line, index) => ({
      rowNumber: index + FIRST_DATA_ROW_NUMBER,
      values: parseCsvLine(line)
    }))
  };
};
