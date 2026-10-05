import { createContext, useContext, useEffect, useState } from "react";
import { get } from "../services/api";
import {
  applyDoctypeAccess,
  getAccessibleModules,
  getFailClosedModules,
} from "../config/moduleAccess";
import { getCurrentUser } from "../utils/getUser";

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [userRoles, setUserRoles] = useState([]);
  const [accessibleModules, setAccessibleModules] = useState([]);
  const [currentUser, setCurrentUser] = useState("");
  const [loading, setLoading] = useState(true);

  // Real doctype read permissions from erpnext_ui.api.get_ui_access.
  //
  // Defaults to empty objects, i.e. "no access to anything", so the very first
  // render and any failed fetch withhold the gated surfaces instead of briefly
  // showing them.
  const [doctypeAccess, setDoctypeAccess] = useState({
    approvals: {},
    reports: {},
  });

  async function fetchUserRoles() {
    try {
      const [session, accessRes] = await Promise.all([
        getCurrentUser(get),
        get("method/erpnext_ui.api.get_ui_access"),
      ]);

      const access = {
        approvals: accessRes?.message?.approvals || {},
        reports: accessRes?.message?.reports || {},
      };
      setDoctypeAccess(access);

      if (session) {
        setCurrentUser(session.user);
        setUserRoles(session.roles);
        setAccessibleModules(
          applyDoctypeAccess(
            getAccessibleModules(session.roles),
            access,
          ),
        );
      } else {
        // Session resolved to nothing (logged out, or the endpoint returned no
        // payload). Treat as unknown permissions rather than as "public".
        console.warn(
          "No user session found. Showing self-service only.",
        );
        setAccessibleModules(applyDoctypeAccess(getFailClosedModules(), access));
      }
    } catch (e) {
      // Fail closed. The previous fallback was getAccessibleModules(["*"]),
      // which returns ESS + Approvals + Reports -- so any network blip granted
      // every user the Approvals hub and the Reports page. Withhold everything
      // that is not explicitly public instead.
      console.error("Failed to load user roles:", e);
      setDoctypeAccess({ approvals: {}, reports: {} });
      setAccessibleModules(getFailClosedModules());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetchUserRoles setStates only after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUserRoles();
  }, []);

  const hasModuleAccess = (moduleKey) => {
    return accessibleModules.includes(moduleKey);
  };

  /**
   * Whether the user can read an Approvals doctype.
   *
   * Visibility only: a readable doctype with zero pending documents still shows
   * its tile (with a count of 0), so tiles do not disappear as data changes.
   */
  const canReadApprovalDoctype = (doctype) =>
    Boolean(doctypeAccess.approvals?.[doctype]);

  /** Whether the user can read a report's backing doctype. */
  const canReadReport = (reportKey) =>
    Boolean(doctypeAccess.reports?.[reportKey]);

  return (
    <RoleContext.Provider
      value={{
        userRoles,
        currentUser,
        accessibleModules,
        hasModuleAccess,
        doctypeAccess,
        canReadApprovalDoctype,
        canReadReport,
        loading,
        refresh: fetchUserRoles,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
