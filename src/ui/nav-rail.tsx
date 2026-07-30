"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavRailItem = { label: string; href: string; glyph: string };

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
  return (
    <nav className="nav-rail" aria-label={label}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-rail-link"
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-rail-glyph" aria-hidden="true">
              {item.glyph}
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
            aria-current={isActive(pathname, systemItem.href) ? "page" : undefined}
          >
            <span className="nav-rail-glyph" aria-hidden="true">
              {systemItem.glyph}
            </span>
            <span className="nav-rail-label">{systemItem.label}</span>
          </Link>
        </>
      )}
    </nav>
  );
}
