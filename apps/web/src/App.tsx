import { useState } from "react";
import { GlobalPreview } from "./components/GlobalPreview";
import { GuidedPlanner } from "./components/GuidedPlanner";

export default function App() {
  const [mode, setMode] = useState<"regional" | "global">("regional");
  const [globalVisited, setGlobalVisited] = useState(false);
  return <main id="top">
    <header className="topbar"><a className="brand" href="#top" aria-label="Lumen home"><img src="/lumen-mark.svg" alt="" /><span>LUMEN<span className="brand-caption">LUNAR EXPLORATION PLANNER</span></span></a><span className="prototype-badge">RESEARCH PROTOTYPE</span></header>
    <nav className="workspace-switch" aria-label="Analysis coverage">
      <button aria-pressed={mode === "regional"} onClick={() => setMode("regional")}>South-pole site search</button>
      <button aria-pressed={mode === "global"} onClick={() => { setGlobalVisited(true); setMode("global"); }}>Anywhere on the Moon</button>
    </nav>
    <div hidden={mode !== "regional"}><GuidedPlanner /></div>
    {globalVisited && <div hidden={mode !== "global"}><GlobalPreview /></div>}
  </main>;
}
