import { createContext, useContext } from "react";

export const ListFloatingActionsContext = createContext(null);
export const useListFloatingActions = () => useContext(ListFloatingActionsContext);
