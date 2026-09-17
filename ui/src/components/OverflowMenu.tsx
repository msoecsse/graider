import { useEffect, useRef, useState, type ReactElement } from "react";

export interface OverflowMenuItem {
  readonly id: string;
  readonly label: string;
  readonly caption?: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}

export interface OverflowMenuGroup {
  readonly id: string;
  readonly heading?: string;
  readonly items: readonly OverflowMenuItem[];
}

export interface OverflowMenuProps {
  readonly groups: readonly OverflowMenuGroup[];
  readonly "aria-label"?: string;
}

export const OverflowMenu = ({
  groups,
  "aria-label": ariaLabel = "More actions"
}: OverflowMenuProps): ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!(containerRef.current?.contains(event.target as Node) ?? false)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectItem = (item: OverflowMenuItem): void => {
    if (item.disabled === true) {
      return;
    }

    setIsOpen(false);
    item.onSelect();
  };

  return (
    <div className="overflow-menu" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className="overflow-menu__trigger"
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        ref={triggerRef}
        type="button"
      >
        ⋯
      </button>
      {isOpen ? (
        <div className="overflow-menu__panel" role="menu" aria-label={ariaLabel}>
          {groups.map((group, groupIndex) => (
            <div
              className={
                groupIndex === 0
                  ? "overflow-menu__group"
                  : "overflow-menu__group overflow-menu__group--separated"
              }
              key={group.id}
            >
              {group.heading === undefined ? null : (
                <div className="overflow-menu__heading">{group.heading}</div>
              )}
              {group.items.map((item) => (
                <button
                  className={
                    item.destructive === true
                      ? "overflow-menu__item overflow-menu__item--destructive"
                      : "overflow-menu__item"
                  }
                  disabled={item.disabled === true}
                  key={item.id}
                  onClick={() => {
                    selectItem(item);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="overflow-menu__item-label">{item.label}</span>
                  {item.caption === undefined ? null : (
                    <span className="overflow-menu__item-caption">{item.caption}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
