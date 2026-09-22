import type { ReactElement } from "react";
import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  readonly label: string;
  /** Omit on the last item -- the current page is not a link. */
  readonly to?: string;
}

/**
 * README section 4.1: real routes give faculty breadcrumbs in place of
 * hand-placed "Back to dashboard" / "Back to assignment detail" buttons.
 * Rendered above a screen's own `<main>`, not inside it, so every routed
 * screen gets the same trail without changing its internal layout.
 */
export const Breadcrumbs = ({
  items
}: {
  readonly items: readonly BreadcrumbItem[];
}): ReactElement => (
  <nav className="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1 || item.to === undefined;

        return (
          <li key={`${item.label}-${String(index)}`}>
            {isCurrent ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <Link to={item.to as string}>{item.label}</Link>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);
