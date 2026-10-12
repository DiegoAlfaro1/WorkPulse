import { useState } from 'react';
import { Checkmark, Icon } from '../atoms';

export function TagPicker({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = tg => onChange(value.includes(tg) ? value.filter(x => x !== tg) : [...value, tg]);
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
        </div>
      </>}
    </>
  );
}
