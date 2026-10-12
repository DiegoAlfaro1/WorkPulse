export const Panel = ({ title, hint, className = '', children }) => (
  <section className={('panel ' + className).trim()}>
    <div className="panel-h"><h4>{title}</h4>{hint && <span className="text-muted">{hint}</span>}</div>
    {children}
  </section>
);
