import { Icon } from '../atoms';

export const BillableToggle = ({ value, onChange }) => (
  <button type="button" className={'input pick-btn bill' + (value ? ' on' : '')} aria-pressed={value} onClick={() => onChange(!value)}>
    <Icon n="dollar" s={14} />{value ? 'Billable' : 'Non-billable'}
  </button>
);
