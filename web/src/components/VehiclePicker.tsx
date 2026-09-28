import { VEHICLE_LABEL, type Vehicle } from "../vehicle";

interface VehiclePickerProps {
  vehicle: Vehicle;
  onChange: (vehicle: Vehicle) => void;
  onEditPermits: () => void;
}

// Not a vehicle: picking it opens the permits page and leaves the vehicle as it was.
const EDIT_PERMITS = "edit-permits";

/** A small select in the corner for what the user is driving. A native select, so phones
 * open their own picker for it. With a permit, it also offers a way back to the permits. */
export function VehiclePicker({ vehicle, onChange, onEditPermits }: VehiclePickerProps) {
  return (
    <label className="app__vehicle">
      <span className="app__vehicle-label">{VEHICLE_LABEL[vehicle]}</span>
      <span className="app__vehicle-chevron" aria-hidden="true">
        ▼
      </span>
      <select
        className="app__vehicle-select"
        aria-label="What are you driving?"
        value={vehicle}
        onChange={(e) => {
          const { value } = e.currentTarget;
          if (value === EDIT_PERMITS) {
            e.currentTarget.value = vehicle;
            onEditPermits();
          } else {
            onChange(value as Vehicle);
          }
        }}
      >
        {(Object.keys(VEHICLE_LABEL) as Vehicle[]).map((v) => (
          <option key={v} value={v}>
            {VEHICLE_LABEL[v]}
          </option>
        ))}
        {vehicle === "permit" && <option value={EDIT_PERMITS}>Edit permits…</option>}
      </select>
    </label>
  );
}
