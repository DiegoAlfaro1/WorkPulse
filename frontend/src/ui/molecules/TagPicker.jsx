import { useState } from 'react';
import { Checkmark, Icon } from '../atoms';

export function TagPicker({ options, value, onChange, onCreate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const toggle = tg => onChange(value.includes(tg) ? value.filter(x => x !== tg) : [...value, tg]);
  const create = async e => {
    e.preventDefault();
    const name = draft.trim().replace(/^#/, '');
    if (!name) return;
    try {
      const tg = options.find(o => o.toLowerCase() === name.toLowerCase()) ?? await onCreate(name);
      if (!value.includes(tg)) onChange([...value, tg]);
      setDraft('');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <>
      <button className="input pick-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon n="tag" s={14} />
        <span className="pick-txt">{value.length ? value.map(t => '#' + t).join(' ') : 'Add tags'}</span>
        <Icon n="chevron" s={14} />
      </button>
      {open && <>
        <div className="pop-scrim" onClick={() => setOpen(false)} />
        <div className="pop elev-md">
          {options.map(tg => (
            <button key={tg} className="pop-item" aria-pressed={value.includes(tg)} onClick={() => toggle(tg)}>
              <Checkmark checked={value.includes(tg)} />#{tg}
            </button>
          ))}
          <form className="pop-new" onSubmit={create}>
            <input className="input" placeholder="New tag, press Enter" aria-label="New tag"
              value={draft} onChange={e => setDraft(e.target.value)} />
            {error && <p className="text-muted" role="alert">{error}</p>}
          </form>
        </div>
      </>}
    </>
  );
}
