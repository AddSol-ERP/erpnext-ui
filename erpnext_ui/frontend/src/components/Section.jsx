export default function Section({ title, children }) {
  return (
    <div className="mb-3">
      {title && <div className="card-title mb-3">{title}</div>}
      {children}
    </div>
  );
}
