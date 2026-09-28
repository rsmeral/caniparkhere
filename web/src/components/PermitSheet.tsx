import { useEffect, useState } from "preact/hooks";
import { compareAreas } from "../areas";
import { Sheet } from "./Sheet";

interface PermitSheetProps {
  open: boolean;
  /** Every area a permit can be for, in order, or null while they load. */
  areas: string[] | null;
  /** The permits saved so far, which the page starts from each time it opens. */
  permits: string[];
  onSave: (permits: string[]) => void;
  onClose: () => void;
}

/**
 * The page for picking which parking areas the user's permits are for: one row per
 * district, the whole district first, then its smaller sub-areas where it has them. Any
 * number can be picked, since a car can hold several permits.
 */
export function PermitSheet({ open, areas, permits, onSave, onClose }: PermitSheetProps) {
  const [picked, setPicked] = useState<string[]>(permits);

  useEffect(() => {
    if (open) setPicked(permits);
  }, [open]);

  const toggle = (area: string) =>
    setPicked((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );

  const districts = (areas ?? []).filter((a) => !a.includes("."));
  const subAreasOf = (district: string) =>
    (areas ?? []).filter((a) => a.startsWith(`${district}.`));

  const chip = (area: string, label: string) => (
    <button
      type="button"
      key={area}
      className="app__permit-chip"
      aria-pressed={picked.includes(area)}
      onClick={() => toggle(area)}
    >
      {label}
    </button>
  );

  return (
    <Sheet title="Your permits" open={open} onClose={onClose}>
      <p>Pick the areas your parking permits are for. Every zone's sign shows its area.</p>
      {areas === null ? (
        <p>Loading the areas...</p>
      ) : (
        <ul className="app__permit-list">
          {districts.map((district) => (
            <li key={district} className="app__permit-row">
              {chip(district, `Praha ${district}`)}
              {subAreasOf(district).map((sub) => chip(sub, sub))}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="app__permit-save"
        onClick={() => onSave([...picked].sort(compareAreas))}
      >
        Save
      </button>
    </Sheet>
  );
}
