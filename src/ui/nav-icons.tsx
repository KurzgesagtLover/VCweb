export const NAV_ICON_NAMES = [
  "diplomacyMap",
  "briefing",
  "politics",
  "economy",
  "society",
  "historyGeography",
  "territory",
  "construction",
  "research",
  "event",
  "submission",
  "world",
  "chat",
  "switchCountry",
  "country",
  "shield",
  "settings",
] as const;

export type NavIconName = (typeof NAV_ICON_NAMES)[number];

export function NavIcon({ name }: { name: NavIconName }) {
  const artwork = (() => {
    switch (name) {
      case "diplomacyMap":
        return (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5M12 3.5C9.9 5.8 8.8 8.6 8.8 12S9.9 18.2 12 20.5" />
            <circle cx="6.2" cy="8" r="1.2" className="nav-icon-fill" />
            <circle cx="17.8" cy="15.8" r="1.2" className="nav-icon-fill" />
            <path d="m7.3 8.6 9.4 6.6" />
          </>
        );
      case "briefing":
        return (
          <>
            <path d="M6 3.5h9l3 3V20.5H6z" />
            <path d="M15 3.5v3h3M9 10h6M9 13.5h6M9 17h4" />
          </>
        );
      case "politics":
        return (
          <>
            <path d="m4 9 8-5 8 5M5 10h14M6.5 10v7M10.2 10v7M13.8 10v7M17.5 10v7M4 17h16M3 20h18" />
          </>
        );
      case "economy":
        return (
          <>
            <path d="M4 4v16h16M7 16l3.4-4 3 2 5.1-6" />
            <path d="M15.5 8h3v3" />
          </>
        );
      case "society":
        return (
          <>
            <circle cx="12" cy="7" r="2.5" />
            <circle cx="5.5" cy="9.5" r="2" />
            <circle cx="18.5" cy="9.5" r="2" />
            <path d="M7.5 19v-1.2c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6V19M2.8 18v-.8c0-2 1.4-3.6 3.3-3.6.8 0 1.5.3 2.1.8M21.2 18v-.8c0-2-1.4-3.6-3.3-3.6-.8 0-1.5.3-2.1.8" />
          </>
        );
      case "historyGeography":
        return (
          <>
            <path d="M3.5 5.5c2.8-.8 5.6-.2 8.5 1.8v13c-2.9-2-5.7-2.6-8.5-1.8zM20.5 5.5c-2.8-.8-5.6-.2-8.5 1.8v13c2.9-2 5.7-2.6 8.5-1.8z" />
            <path d="m15.5 9.2 2.2 2.2-3.2 3.2-1.2-1.2z" />
          </>
        );
      case "territory":
        return (
          <>
            <path d="m3.5 6 5-2.5 7 2.5 5-2.5v14.7l-5 2.3-7-2.3-5 2.3zM8.5 3.5v14.7M15.5 6v14.5" />
            <circle cx="12" cy="11" r="2" />
            <path d="M12 13v2" />
          </>
        );
      case "construction":
        return (
          <>
            <path d="M4 21h16M6 21V9h8v12M14 6h4v15M8 12h4M8 15h4M8 18h4M16 10h2M16 14h2M16 18h2" />
            <path d="M3 9h12M6 6h8M10 3v6" />
          </>
        );
      case "research":
        return (
          <>
            <ellipse cx="12" cy="12" rx="9" ry="3.6" />
            <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
            <circle cx="12" cy="12" r="1.4" className="nav-icon-fill" />
          </>
        );
      case "event":
        return (
          <>
            <path d="m12 2.8 8.2 4.7v9L12 21.2l-8.2-4.7v-9z" />
            <path d="m13.3 6-4.1 6.2h3.2L10.8 18l4.1-6.5h-3.2z" />
          </>
        );
      case "submission":
        return (
          <>
            <path d="M5 3.5h10l3 3v6.2M15 3.5v3h3M8 9.5h6M8 13h3" />
            <path d="m10.5 19.5.8-3.2 6.3-6.3 2.4 2.4-6.3 6.3zM17 10.7l2.3 2.3" />
          </>
        );
      case "world":
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9M12 3c-2.3 2.5-3.5 5.5-3.5 9s1.2 6.5 3.5 9" />
          </>
        );
      case "chat":
        return (
          <>
            <path d="M4 4.5h12v9H9l-4 3v-3H4z" />
            <path d="M9 16h6l4 3v-3h1V8h-2M7 8h6M7 10.5h4" />
          </>
        );
      case "switchCountry":
        return (
          <>
            <path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" />
          </>
        );
      case "country":
        return (
          <>
            <path d="M5 21V3M6 4h11l-2 4 2 4H6" />
          </>
        );
      case "shield":
        return (
          <>
            <path d="M12 3 19 6v5.5c0 4.4-2.8 7.6-7 9.5-4.2-1.9-7-5.1-7-9.5V6z" />
            <path d="m8.7 12 2.1 2.1 4.6-4.6" />
          </>
        );
      case "settings":
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
          </>
        );
    }
  })();

  return (
    <svg
      className="nav-rail-icon"
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {artwork}
    </svg>
  );
}
