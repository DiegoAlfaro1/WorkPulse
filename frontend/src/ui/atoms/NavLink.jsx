export const NavLink = ({ active, ...props }) => (
  <button className={'navlink' + (active ? ' on' : '')} aria-current={active ? 'page' : undefined} {...props} />
);
