import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
const routeNames: Record<string, string> = {
  "/": "Overview",
  "/markets": "Markets",
  "/protect": "Protect assets",
  "/provide": "Provide capital",
  "/trade": "Trade & convert",
  "/positions": "My positions",
  "/portfolio": "Portfolio",
  "/activity": "Activity",
  "/create-pool": "Create a pool",
  "/faucet": "Get test tokens",
  "/assets": "Asset identities",
  "/status": "Network status",
  "/how-it-works": "Field guide",
  "/learn/scenarios": "Scenarios",
  "/legal": "Terms & risks",
};
export function routeName(path: string) {
  return (
    routeNames[path] ||
    (path.startsWith("/pools/")
      ? "Market details"
      : path.startsWith("/positions/")
        ? "Position details"
        : "Page not found")
  );
}
export function decodeRoutePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
/** Restore orientation after client navigation without moving focus during input edits. */
export function RouteOrientation() {
  const location = useLocation(),
    navigationType = useNavigationType();
  const previous = useRef(location.pathname);
  useEffect(() => {
    document.title = `${routeName(location.pathname)} · YieldShield Alpine`;
    const changed = previous.current !== location.pathname;
    previous.current = location.pathname;
    if (!changed && !location.hash) return;
    let observer: MutationObserver | undefined;
    const orient = () => {
      const target = location.hash
        ? document.getElementById(decodeRoutePart(location.hash.slice(1)))
        : document.querySelector<HTMLElement>("#main-content h1");
      if (!target) return false;
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (location.hash) target.scrollIntoView({ block: "start" });
      else if (navigationType !== "POP")
        window.scrollTo({ top: 0, behavior: "instant" });
      observer?.disconnect();
      return true;
    };
    if (!orient()) {
      observer = new MutationObserver(orient);
      observer.observe(document.getElementById("main-content")!, {
        childList: true,
        subtree: true,
      });
    }
    return () => observer?.disconnect();
  }, [location.pathname, location.hash, navigationType]);
  return null;
}
