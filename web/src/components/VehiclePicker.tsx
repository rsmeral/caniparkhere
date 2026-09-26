import { VEHICLE_LABEL, type Vehicle } from "../vehicle";

interface VehiclePickerProps {
  vehicle: Vehicle;
  onChange: (vehicle: Vehicle) => void;
}

/** A small select in the corner for what the user is driving. A native select, so phones
 * open their own picker for it. */
export function VehiclePicker({ vehicle, onChange }: VehiclePickerProps) {
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
        onChange={(e) => onChange(e.currentTarget.value as Vehicle)}
      >
        {(Object.keys(VEHICLE_LABEL) as Vehicle[]).map((v) => (
          <option key={v} value={v}>
            {VEHICLE_LABEL[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
