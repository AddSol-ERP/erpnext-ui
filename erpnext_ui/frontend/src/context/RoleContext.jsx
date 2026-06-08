import { createContext, useContext, useEffect, useState } from "react";
import { get } from "../services/api";
import { getAccessibleModules } from "../config/moduleAccess";
import { getCurrentUser } from "../utils/getUser";

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [userRoles, setUserRoles] = useState([]);
  const [accessibleModules, setAccessibleModules] = useState([]);
  const [currentUser, setCurrentUser] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserRoles();
  }, []);

  const fetchUserRoles = async () => {
    try {
      const session = await getCurrentUser(get);

      if (session) {
        setCurrentUser(session.user);
        setUserRoles(session.roles);
        setAccessibleModules(getAccessibleModules(session.roles));
      } else {
        // No session and no API response — can't determine access
        console.warn("No user session found. Showing public modules only.");
        setAccessibleModules(getAccessibleModules(["*"]));
      }
    } catch (e) {
      console.error("Failed to load user roles:", e);
      setAccessibleModules(getAccessibleModules(["*"]));
    } finally {
      setLoading(false);
    }
  };

  const hasModuleAccess = (moduleKey) => {
    return accessibleModules.includes(moduleKey);
  };

  return (
    <RoleContext.Provider
      value={{
        userRoles,
        currentUser,
        accessibleModules,
        hasModuleAccess,
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
