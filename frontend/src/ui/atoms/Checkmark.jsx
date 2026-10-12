import { Icon } from './Icon.jsx';

export const Checkmark = ({ checked }) => (
  <span className={'chk' + (checked ? ' on' : '')}>{checked && <Icon n="check" s={12} />}</span>
);
