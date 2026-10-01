export default function Section({ title, children }) {
  return (
    <div className="mb-3">
      {title && (
        <div className="mb-3 text-sm font-semibold text-foreground">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
