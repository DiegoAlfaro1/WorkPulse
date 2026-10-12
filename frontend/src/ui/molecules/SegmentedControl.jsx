/** options: [[value, label], ...] */
export const SegmentedControl = ({ name, value, options, onChange }) => (
  <div className="seg">
    {options.map(([v, l]) => (
      <label key={v} className="seg-opt">
        <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{l}
      </label>
    ))}
  </div>
);
