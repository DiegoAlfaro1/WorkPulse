export const PageShell = ({ className = '', children }) => (
  <main className={('wp-shell ' + className).trim()}>{children}</main>
);
