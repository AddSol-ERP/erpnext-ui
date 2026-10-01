/**
 * Shared page wrapper for all dashboards / hub landings.
 * Owns max-width, top padding, and vertical rhythm.
 */
export default function DashboardShell({ children, className = "" }) {
  return (
    <div
      className={`mx-auto w-full max-w-[1600px] space-y-4 pt-4 md:space-y-6 ${className}`}
    >
      {children}
    </div>
  );
}
