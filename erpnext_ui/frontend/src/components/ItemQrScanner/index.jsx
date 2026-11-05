import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ScanLine } from "lucide-react";
import AppModal from "../AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { post } from "../../services/api";
import { frappeAssetUrl } from "../../lib/frappeAssets";

let decoderPromise;
function loadDecoder() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (!decoderPromise) decoderPromise = new Promise((resolve, reject) => {
    // Reuse Frappe's installed scanner library; no external CDN or camera upload.
    const script = document.createElement("script");
    script.src = frappeAssetUrl(
      "/assets/frappe/node_modules/html5-qrcode/html5-qrcode.min.js",
      import.meta.env.VITE_API_BASE_URL,
      window.location.origin,
    );
    script.onload = () => window.Html5Qrcode ? resolve(window.Html5Qrcode) : reject(new Error("decoder"));
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(error => { decoderPromise = null; throw error; });
  return decoderPromise;
}

function ScanDialog({ onClose, onScan }) {
  const { t } = useTranslation();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const scanner = useRef(null);
  const alive = useRef(true);
  const resolving = useRef(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const active = scanner.current;
      if (active?.isScanning) active.stop().catch(() => {});
    };
  }, []);
  const resolve = async text => {
    if (resolving.current) return;
    resolving.current = true;
    setBusy(true); setError("");
    if (scanner.current?.isScanning) await scanner.current.stop().catch(() => {});
    setCamera(false);
    try {
      const result = await post("method/erpnext_ui.item_qr.resolve_item_qr", { value: text });
      if (!alive.current) return;
      await onScan(result.message);
      if (alive.current) onClose();
    } catch (failure) {
      if (alive.current) setError(failure.message?.startsWith("qr.") ? t(failure.message) : failure.message || t("qr.invalid"));
    } finally {
      resolving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const startCamera = async () => {
    setBusy(true); setError("");
    try {
      const Decoder = await loadDecoder();
      if (!alive.current) return;
      const active = new Decoder(id);
      scanner.current = active;
      await active.start({ facingMode: "environment" }, { fps: 8, qrbox: 240 }, resolve, () => {});
      if (!alive.current) { await active.stop(); return; }
      setCamera(Boolean(active.isScanning));
    } catch {
      if (alive.current) setError(t("qr.cameraFailed"));
    } finally { if (alive.current) setBusy(false); }
  };
  return <AppModal show onClose={onClose} title={t("qr.scan")}>
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("qr.hint")}</p>
      <div id={id} className="w-full" />
      <Button type="button" variant="outline" disabled={busy || camera} onClick={startCamera}><Camera />{t("qr.camera")}</Button>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); resolve(value); }}>
        <Input aria-label={t("qr.link")} value={value} onChange={event => setValue(event.target.value)} placeholder={t("qr.link")} disabled={busy} />
        <Button type="submit" disabled={busy || !value.trim()}>{t("qr.use")}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </AppModal>;
}

export default function ItemQrScanner({ onScan, disabled = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}><ScanLine />{t("qr.scan")}</Button>
    {open && <ScanDialog onClose={() => setOpen(false)} onScan={onScan} />}
  </>;
}
