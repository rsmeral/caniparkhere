import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { loadData, type LoadedData } from "./dataStore";
import { describe, type Display } from "./describe";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import { useGeolocation } from "./useGeolocation";

const neutral = (emoji: string, sentence: string): Display => ({
  tone: "neutral",
  emoji,
  sentence,
  warning: null,
});

export function App() {
  const geo = useGeolocation();
  const [data, setData] = useState<LoadedData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((err) => setDataError((err as Error).message));
  }, []);

  const indexes = useMemo(() => (data ? buildIndexes(data) : null), [data]);

  const display: Display = useMemo(() => {
    if (dataError) return neutral("😵", `Couldn't load zone data: ${dataError}`);
    if (geo.status === "error") return neutral("🤷", geo.message);
    if (!data || !indexes || geo.status === "loading") {
      return neutral("⏳", "Figuring out where you are...");
    }
    if (!isWithinBounds(data.bounds, geo.lon, geo.lat)) {
      return describe({ kind: "outOfArea" });
    }
    const result = queryStatus(data, indexes, geo.lon, geo.lat);
    return describe(result.status, result.upcomingClosure);
  }, [data, indexes, geo, dataError]);

  return (
    <div className={`app app--${display.tone}`}>
      <div className="app__emoji">{display.emoji}</div>
      <p className="app__sentence">{display.sentence}</p>
      {display.warning && <p className="app__warning">{display.warning}</p>}
    </div>
  );
}
