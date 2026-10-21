/** Inert report content: no HTML, attributes, resources, or student-controlled IDs. */
export type DocumentTag =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "br"
  | "strong"
  | "b"
  | "em"
  | "i"
  | "u"
  | "s"
  | "ul"
  | "ol"
  | "li"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "td"
  | "th"
  | "sup"
  | "sub"
  | "blockquote";
export type DocumentNode =
  | { readonly text: string }
  | { readonly tag: DocumentTag; readonly children: readonly DocumentNode[] };
export type DocumentContent =
  | { readonly status: "content"; readonly nodes: readonly DocumentNode[] }
  | { readonly status: "unavailable"; readonly message: string };
export interface ReportDocument {
  readonly file: string;
  readonly content: DocumentContent;
}
