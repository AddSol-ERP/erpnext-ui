/**
 * SSR stand-in for AppModal.
 *
 * Radix's Dialog renders through a Portal, so under renderToString AppModal
 * produces an empty string -- every assertion about dialog CONTENT is
 * impossible in this harness, not because the component is broken. This stub
 * renders title/children/footer inline so a suite can assert on what a dialog
 * actually shows. Enabled only with SSR_MODAL_STUB=1.
 */
export default function AppModalStub({ show, title, children, footer }) {
  if (!show) return null;
  return (
    <div data-modal="stub">
      <h2>{title}</h2>
      <div>{children}</div>
      <div data-modal-footer="true">{footer}</div>
    </div>
  );
}
