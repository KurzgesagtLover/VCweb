"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavIconName } from "./nav-icons";

export type NavRailItem = { label: string; href: string; icon: NavIconName };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavRail({
  items,
  label,
  systemItem,
}: {
  items: NavRailItem[];
  label: string;
  systemItem?: NavRailItem;
}) {
  const pathname = usePathname() ?? "";
  const activeHref = [...items, ...(systemItem ? [systemItem] : [])]
    .filter((item) => isActive(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  return (
    <nav className="nav-rail" aria-label={label}>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-rail-link"
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-rail-surface" aria-hidden="true" />
            <span
              className="nav-rail-glyph"
              aria-hidden="true"
              style={{ display: "grid", width: 21, height: 21, placeItems: "center" }}
            >
              <NavIcon name={item.icon} />
            </span>
            <span className="nav-rail-label">{item.label}</span>
          </Link>
        );
      })}
      {systemItem && (
        <>
          <span className="nav-rail-divider" aria-hidden="true" />
          <Link
            href={systemItem.href}
            className="nav-rail-link"
            aria-current={systemItem.href === activeHref ? "page" : undefined}
          >
            <span className="nav-rail-surface" aria-hidden="true" />
            <span
              className="nav-rail-glyph"
              aria-hidden="true"
              style={{ display: "grid", width: 21, height: 21, placeItems: "center" }}
            >
              <NavIcon name={systemItem.icon} />
            </span>
            <span className="nav-rail-label">{systemItem.label}</span>
          </Link>
        </>
      )}
    </nav>
  );
}
