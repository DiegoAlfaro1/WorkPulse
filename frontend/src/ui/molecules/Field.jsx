export const Field = ({ label, className = '', children }) => (
  <div className={('field ' + className).trim()}><label>{label}</label>{children}</div>
);
