/** Checkbox list of teams; value is an array of team ids. */
export const TeamChecklist = ({ teams, value, onChange }) => (
  <div className="checks">
    {teams.length ? teams.map(t => (
      <label key={t.id} className="check">
        <input type="checkbox" checked={value.includes(t.id)}
          onChange={e => onChange(e.target.checked ? [...value, t.id] : value.filter(x => x !== t.id))} />
        {t.name}
      </label>
    )) : <span className="text-muted">No teams yet</span>}
  </div>
);
