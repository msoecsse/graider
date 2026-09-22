import { parseCsv, type CsvDocument, type CsvRow } from "../io/csv.js";

const BYTE_ORDER_MARK = "﻿";

export type RosterCsvDocument = CsvDocument;
export type RosterCsvRow = CsvRow;

const stripByteOrderMark = (content: string): string =>
  content.startsWith(BYTE_ORDER_MARK) ? content.slice(BYTE_ORDER_MARK.length) : content;

// src/io/csv.ts already has the strongest quote/comma/CRLF handling of the
// four existing roster CSV parsers; this only adds the one capability none
// of them have (a leading UTF-8 byte-order mark, which some spreadsheet
// exports include).
export const parseRosterCsvText = (content: string): RosterCsvDocument =>
  parseCsv(stripByteOrderMark(content));
