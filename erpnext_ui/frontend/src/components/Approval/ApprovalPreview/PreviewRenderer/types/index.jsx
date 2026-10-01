export function BasePreview({ title, meta, children, actions }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-none bg-card text-card-foreground ring-1 ring-foreground/10">
      {/* HEADER */}
      {(title || meta) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && (
              <div className="truncate text-sm font-semibold">{title}</div>
            )}
            {meta && (
              <div className="truncate text-xs text-muted-foreground">
                {meta}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BODY */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        {children}
      </div>

      {/* ACTIONS */}
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
          {actions}
        </div>
      )}
    </div>
  );
}
