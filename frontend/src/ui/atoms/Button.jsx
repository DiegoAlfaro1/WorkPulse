export const Button = ({ variant, className = '', ...props }) => (
  <button className={['btn', variant && `btn-${variant}`, className].filter(Boolean).join(' ')} {...props} />
);
