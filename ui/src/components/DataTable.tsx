import type { ReactElement, ReactNode } from "react";

export interface DataTableColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  readonly align?: "start" | "end";
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly getRowKey: (row: Row) => string;
  readonly emptyState?: ReactNode;
}

export const DataTable = <Row,>({
  columns,
  rows,
  getRowKey,
  emptyState
}: DataTableProps<Row>): ReactElement => {
  if (rows.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>;
  }

  return (
    <div className="data-table__scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={
                  column.align === "end"
                    ? "data-table__header data-table__header--end"
                    : "data-table__header"
                }
                key={column.key}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  className={
                    column.align === "end"
                      ? "data-table__cell data-table__cell--end"
                      : "data-table__cell"
                  }
                  key={column.key}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
