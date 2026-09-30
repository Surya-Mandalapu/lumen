import { lazy, Suspense, useEffect, useState } from "react";
import { SearchFoundation } from "./components/SearchFoundation";
import { getRegionManifest } from "./lib/api";
import type { RegionManifest } from "./lib/types";

const GlobeScene = lazy(() =>
  import("./components/GlobeScene").then((module) => ({ default: module.GlobeScene })),
);

export default function App() {
  const [manifest, setManifest] = useState<RegionManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  useEffect(() => {
    getRegionManifest()
      .then(setManifest)
      .catch((reason: unknown) =>
        setManifestError(reason instanceof Error ? reason.message : "API unavailable"),
      );
  }, []);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Lumen home">
          <img src="/lumen-mark.svg" alt="" />
          <span>Lumen</span>
        </a>
        <div className="prototype-label">Prototype foundation</div>
      </header>

      <section id="top" className="hero-grid">
        <div className="hero-copy">
          <div className="section-kicker">Lunar south-pole planning indicators</div>
          <h1>See the horizon before the mission meets it.</h1>
          <p>
            Compare illumination, terrain, and geometric direct-to-Earth opportunities
            across a clearly bounded south-polar study region.
          </p>
          <div className="manifest-strip">
            {manifest ? (
              <>
                <span><strong>{manifest.analysis.terrain_resolution_m} m</strong> terrain</span>
                <span><strong>{manifest.analysis.candidate_spacing_m} m</strong> candidates</span>
                <span><strong>{manifest.analysis.observer_height_m} m</strong> observer</span>
              </>
            ) : manifestError ? (
              <span className="api-warning">API offline · start the FastAPI service</span>
            ) : (
              <span>Loading regional manifest…</span>
            )}
          </div>
        </div>
        <Suspense fallback={<div className="globe-shell globe-loading">Loading 3D context…</div>}>
          <GlobeScene />
        </Suspense>
      </section>

      <section className="workspace-grid">
        <SearchFoundation />
        <article className="status-card">
          <div className="section-kicker">Scientific readiness</div>
          <h2>Foundation ready. Data preparation pending.</h2>
          <ul>
            <li><span className="status-dot ready" /> Typed region and validation APIs</li>
            <li><span className="status-dot ready" /> Versioned data and frame manifest</li>
            <li><span className="status-dot pending" /> LOLA-derived regional artifacts</li>
            <li><span className="status-dot pending" /> SPICE horizon and interval engine</li>
          </ul>
          <p>
            The app will not display synthetic landing-site results as if they were NASA-derived.
            Candidate search unlocks only after the derived-data manifest is marked prepared.
          </p>
        </article>
      </section>

      <footer>
        Comparative planning indicators only. Not flight certified and not a landing-safety determination.
      </footer>
    </main>
  );
}

