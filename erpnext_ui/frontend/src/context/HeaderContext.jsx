import { createContext, useContext, useState } from "react";

const HeaderContext = createContext();

/**
 * header: page title/breadcrumbs/actions/status via setHeader (unchanged).
 * shellMode: "default" | "list" — ListLayout sets "list" so AppShell
 * suppresses bottom-bar actions (they render inside ActionBar instead).
 */
export const HeaderProvider = ({ children }) => {
  const [header, setHeader] = useState({});
  const [shellMode, setShellMode] = useState("default");

  return (
    <HeaderContext.Provider value={{ header, setHeader, shellMode, setShellMode }}>
      {children}
    </HeaderContext.Provider>
  );
};

export const useHeader = () => useContext(HeaderContext);
