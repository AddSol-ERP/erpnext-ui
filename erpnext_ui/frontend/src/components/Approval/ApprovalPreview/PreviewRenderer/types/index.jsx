export function BasePreview({ title, meta, children, actions }) {
  return (
    <div className="preview-card">
      {/* HEADER */}
      <div className="preview-header">
        <div>
          <div className="preview-title">{title}</div>
          <div className="preview-meta">{meta}</div>
        </div>
      </div>

      {/* BODY */}
      <div className="preview-body">{children}</div>

      {/* ACTIONS */}
      <div className="preview-actions">{actions}</div>
    </div>
  );
}
