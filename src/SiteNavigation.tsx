import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { RouteLink } from "./ui";

const primary = [
  ["/markets", "Markets"],
  ["/trade", "Trade"],
  ["/protect", "Protect"],
  ["/provide", "Provide"],
  ["/positions", "Portfolio"],
] as const;
const secondary = [
  ["/create-pool", "Create a pool"],
  ["/faucet", "Get test tokens"],
  ["/assets", "Asset identities"],
  ["/how-it-works", "Field guide"],
  ["/status", "Network status"],
  ["/legal", "Terms & risks"],
] as const;
const holdings = [
  ["/positions", "Positions"],
  ["/portfolio", "Balances"],
  ["/activity", "Activity"],
] as const;
function isPortfolio(path: string) {
  return holdings.some(([to]) => path === to || path.startsWith(`${to}/`));
}

export function Navigation() {
  const location = useLocation();
  const pool = new URLSearchParams(location.search).get("pool");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMenuOpen(false);
    setMoreOpen(false);
  };
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [location.key]);
  const link = ([to, label]: readonly [string, string]) => {
    const active =
      to === "/positions"
        ? isPortfolio(location.pathname)
        : to === "/markets"
          ? location.pathname === "/" ||
            location.pathname.startsWith("/pools/") ||
            location.pathname === to
          : location.pathname === to;
    return (
      <li key={to}>
        <Link
          to={pool ? `${to}?${new URLSearchParams({ pool })}` : to}
          className={active ? "selected" : ""}
          aria-current={
            active ? (location.pathname === to ? "page" : "true") : undefined
          }
          onClick={(event) => {
            // A same-path link can still change query state. RouteOrientation
            // intentionally ignores those changes to avoid stealing form focus.
            // Move focus explicitly only for this navigation action, before its
            // disclosure hides the activated link.
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            if (location.pathname === to) {
              const target =
                document.querySelector<HTMLElement>("#main-content h1") ||
                document.getElementById("main-content");
              target?.setAttribute("tabindex", "-1");
              target?.focus({ preventScroll: true });
            }
            close();
          }}
        >
          {label}
        </Link>
      </li>
    );
  };
  return (
    <aside
      className="sidebar"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (moreOpen) {
          setMoreOpen(false);
          moreButton.current?.focus();
        } else if (menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}
    >
      <div className="brand-row">
        <RouteLink to="/" className="brand">
          <img src="/mark.svg" alt="" width="38" height="38" />
          <span>
            YieldShield<small>ALPINE / AVALANCHE</small>
          </span>
        </RouteLink>
        <button
          ref={menuButton}
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => {
            setMenuOpen(!menuOpen);
            setMoreOpen(false);
          }}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </div>
      <nav
        id="primary-navigation"
        aria-label="Main navigation"
        data-expanded={menuOpen}
      >
        <ul className="primary-links">{primary.map(link)}</ul>
        <button
          ref={moreButton}
          type="button"
          className="more-toggle"
          aria-expanded={moreOpen}
          aria-controls="more-navigation"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          More
        </button>
        <ul id="more-navigation" className="secondary-links" hidden={!moreOpen}>
          {secondary.map(link)}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <small>Avalanche · Testnet</small>
      </div>
    </aside>
  );
}

/** One portfolio section, with balances and transaction history one level below it. */
export function PortfolioNavigation() {
  const location = useLocation();
  const pool = new URLSearchParams(location.search).get("pool");
  if (!isPortfolio(location.pathname)) return null;
  return (
    <nav className="portfolio-navigation" aria-label="Portfolio navigation">
      {holdings.map(([to, label]) => (
        <NavLink
          key={to}
          to={pool ? `${to}?${new URLSearchParams({ pool })}` : to}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
