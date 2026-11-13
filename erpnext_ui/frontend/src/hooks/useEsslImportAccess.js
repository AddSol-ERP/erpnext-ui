import { useEffect, useState } from "react";
import { getMethod } from "../services/api";

export default function useEsslImportAccess() {
  const [access, setAccess] = useState({ loading: true, allowed: false, can_submit: false });
  useEffect(() => {
    let active = true;
    getMethod("method/erpnext_ui.essl_import.access")
      .then((result) => { if (active) setAccess({ ...result, loading: false }); })
      .catch(() => { if (active) setAccess({ loading: false, allowed: false, can_submit: false }); });
    return () => { active = false; };
  }, []);
  return access;
}
