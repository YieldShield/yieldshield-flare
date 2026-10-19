import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ShieldProvider, useShield } from "./state";
import { localMode, short } from "./chain";
import { RoleFlow, Positions, PositionDetail } from "./Workflows";
import { Markets, PoolDetail } from "./Markets";
import { RouteLink, Notice, Empty } from "./ui";
import { Navigation, PortfolioNavigation } from "./SiteNavigation";
import "./style.css";
const Trade = lazy(() => import("./Trade").then((m) => ({ default: m.Trade })));
const CreatePool = lazy(() =>
  import("./CreatePool").then((m) => ({ default: m.CreatePool })),
);
import { Portfolio, Activity, Faucet, Status, Assets } from "./AccountPages";
import { Guide, Legal } from "./Guide";
import { RouteOrientation, routeName, decodeRoutePart } from "./navigation";
function App() {
  const { account, connect, message, setMessage, markets, loading } =
    useShield();
  const location = useLocation();
  const selected = new URLSearchParams(location.search).get("pool");
  const invalidPool =
    selected &&
    !markets.some((m) => m.key.toLowerCase() === selected.toLowerCase());
  const pathPool = location.pathname.startsWith("/pools/")
    ? decodeRoutePart(location.pathname.slice(7))
    : location.pathname.startsWith("/positions/") &&
        location.pathname.includes(":")
      ? decodeRoutePart(
          location.pathname.slice(11).split(":").slice(0, -1).join(":"),
        )
      : null;
  const mismatchedPool =
    pathPool && selected && pathPool.toLowerCase() !== selected.toLowerCase();
  return (
    <div className="app-shell">
      <RouteOrientation />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navigation />
      <main id="main-content" tabIndex={-1}>
        <header>
          <div className="breadcrumb">
            Alpine <span>/</span> {routeName(location.pathname)}
          </div>
          <div className="header-actions">
            <span className="network">
              <i />
              {localMode ? "LOCAL CHAIN" : "AVALANCHE FUJI"}
            </span>
            <button className="wallet-button" onClick={() => void connect()}>
              {account ? short(account) : "Connect wallet"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>
        <div className="content">
          <Notice />
          <PortfolioNavigation />
          {message && (
            <div className="feedback" role="status">
              {message}
              <button
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {invalidPool || mismatchedPool ? (
            <Empty
              headingLevel={1}
              title={
                loading
                  ? "Loading market registry…"
                  : "Invalid market selection"
              }
            >
              The selected pool could not be verified. No transaction is
              available. <a href="/markets">Choose a market</a>.
            </Empty>
          ) : (
            <Suspense fallback={<p className="notice">Loading page…</p>}>
              <Routes>
                <Route path="/" element={<Markets home />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/pools/:key" element={<PoolDetail />} />
                <Route path="/protect" element={<RoleFlow role="protect" />} />
                <Route path="/provide" element={<RoleFlow role="provide" />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/positions/:key" element={<PositionDetail />} />
                <Route path="/trade" element={<Trade />} />
                <Route path="/create-pool" element={<CreatePool />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/faucet" element={<Faucet />} />
                <Route path="/assets" element={<Assets />} />
                <Route path="/status" element={<Status />} />
                <Route path="/how-it-works" element={<Guide />} />
                <Route path="/learn/scenarios" element={<Guide />} />
                <Route path="/legal" element={<Legal />} />
                <Route
                  path="*"
                  element={
                    <Empty headingLevel={1} title="Page not found">
                      Explore <RouteLink to="/markets">markets</RouteLink> to
                      find a route.
                    </Empty>
                  }
                />
              </Routes>
            </Suspense>
          )}
          <footer>
            <span>▲ YieldShield Alpine</span>
            <p>Capital at risk</p>
            <RouteLink to="/legal">Terms & risks</RouteLink>
          </footer>
        </div>
      </main>
    </div>
  );
}
async function bootstrap() {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_LOCAL_DEMO === "true" &&
    import.meta.env.VITE_LOCAL_WALLET === "true"
  ) {
    const { installLocalWallet } = await import("./local-wallet");
    await installLocalWallet();
  }
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <ShieldProvider>
          <App />
        </ShieldProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
void bootstrap();
