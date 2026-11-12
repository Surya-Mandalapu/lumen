import { useEffect, useState } from "react";

export function SearchBudget() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="search-budget"><span>Elapsed {elapsed}s</span><small>{elapsed >= 30 ? "This request is taking longer than usual. You can keep waiting or cancel." : "Calculating your results. You can cancel at any time."}</small></div>;
}
