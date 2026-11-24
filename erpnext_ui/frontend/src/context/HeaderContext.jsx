import { createContext, useCallback, useContext, useState } from "react";

const HeaderContext = createContext();

/**
 * header: page title/breadcrumbs/actions/status via setHeader (unchanged).
 * shellMode: "default" | "list" | "tabbed-form" — ListLayout sets "list" so AppShell
 * suppresses bottom-bar actions (they render inside ActionBar instead).
 */
export const HeaderProvider = ({ children }) => {
  const [header, setHeader] = useState({});
  const [shellMode, setShellMode] = useState("default");
  const [listToolbars, setListToolbars] = useState([]);
  const registerListToolbar = useCallback((id) => {
    setListToolbars((current) => current.includes(id) ? current : [...current, id]);
    return () => setListToolbars((current) => current.filter((item) => item !== id));
  }, []);

  return (
    <HeaderContext.Provider value={{ header, setHeader, shellMode, setShellMode, listToolbarOwner: listToolbars[0], registerListToolbar }}>
      {children}
    </HeaderContext.Provider>
  );
};

export const useHeader = () => useContext(HeaderContext);
