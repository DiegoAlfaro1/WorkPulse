export const Avatar = ({ name, title }) => (
  <span className="av" title={title}>{name.split(' ').map(x => x[0]).join('')}</span>
);
