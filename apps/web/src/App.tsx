import { GuidedPlanner } from "./components/GuidedPlanner";

export default function App() {
  return <main id="top">
    <header className="topbar"><a className="brand" href="#top" aria-label="Lumen home"><img src="/lumen-mark.svg" alt="" /><span>LUMEN<span className="brand-caption">LUNAR EXPLORATION PLANNER</span></span></a><span className="prototype-badge">RESEARCH PROTOTYPE</span></header>
    <GuidedPlanner />
  </main>;
}
