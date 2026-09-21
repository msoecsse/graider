import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable";

interface StudentRow {
  readonly id: string;
  readonly name: string;
  readonly score: string;
}

const COLUMNS: readonly DataTableColumn<StudentRow>[] = [
  { key: "name", header: "Student", render: (row) => row.name },
  { key: "score", header: "Score", render: (row) => row.score, align: "end" }
];

const ROWS: readonly StudentRow[] = [
  { id: "s1", name: "Ada Lovelace", score: "95 / 100" },
  { id: "s2", name: "Grace Hopper", score: "—" }
];

describe("DataTable", () => {
  it("renders a semantic table with headers and row data", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);

    expect(screen.getByRole("columnheader", { name: "Student" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Score" })).toHaveClass(
      "data-table__header--end"
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("95 / 100")).toBeInTheDocument();
  });

  it("renders the empty state instead of a table when there are no rows", () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyState={<p>No students yet.</p>}
      />
    );

    expect(screen.getByText("No students yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
