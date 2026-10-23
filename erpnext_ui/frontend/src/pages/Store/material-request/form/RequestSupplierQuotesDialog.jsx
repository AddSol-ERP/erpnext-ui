import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, X } from "lucide-react";
import AppModal from "../../../../components/AppModal";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";
import FormSelect from "../../../../components/FormSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { get, getMethod, post } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";

const METHOD = "method/erpnext_ui.supplier_quotation";
const RECIPIENTS_METHOD = `${METHOD}.get_supplier_quotation_recipients`;
const SEND_METHOD = `${METHOD}.send_supplier_quotation_invitations`;
const INVITATIONS_METHOD = `${METHOD}.get_supplier_quotation_invitations`;
const RESEND_METHOD = `${METHOD}.resend_supplier_quotation_invitation`;
const REVOKE_METHOD = `${METHOD}.revoke_supplier_quotation_invitation`;
const REOPEN_METHOD = `${METHOD}.reopen_supplier_quotation_invitation`;
const RETRY_METHOD = `${METHOD}.retry_supplier_response_notification`;

const ACTIVE_STATES = new Set(["Draft", "Sent", "OTP Verified", "Failed"]);

function stateTone(state) {
  if (state === "Responded")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (state === "Expired" || state === "Revoked") {
    return "bg-muted text-muted-foreground";
  }
  if (state === "Failed") return "bg-destructive/15 text-destructive";
  return "bg-primary/10 text-primary";
}

export default function RequestSupplierQuotesDialog({
  show,
  onClose,
  materialRequestName,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [supplierCandidate, setSupplierCandidate] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  // Contact resolution is keyed by the supplier list it describes. Keeping the
  // request key in the state (instead of a separate `loading` boolean) makes
  // "these contacts are stale" a render-time fact, so no effect has to clear
  // state synchronously when the selection changes.
  const supplierKey = suppliers.join("|");
  const [recipientState, setRecipientState] = useState({ key: "", rows: [], error: "" });
  const recipients = useMemo(
    () => (supplierKey && recipientState.key === supplierKey ? recipientState.rows : []),
    [supplierKey, recipientState.key, recipientState.rows],
  );
  const recipientsError =
    supplierKey && recipientState.key === supplierKey ? recipientState.error : "";
  const recipientsLoading = Boolean(supplierKey) && recipientState.key !== supplierKey;
  const [printFormats, setPrintFormats] = useState([
    { value: "Standard", label: "Standard" },
  ]);
  const [printFormat, setPrintFormat] = useState("Standard");
  const [subject, setSubject] = useState(() =>
    t("store.mr.supplierEmail.defaultSubject", { name: materialRequestName }),
  );
  const [message, setMessage] = useState(() =>
    t("store.mr.supplierEmail.defaultMessage"),
  );
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    get("resource/Print Format", {
      filters: JSON.stringify({ doc_type: "Material Request", disabled: 0 }),
      fields: JSON.stringify(["name"]),
      order_by: "name asc",
      limit_page_length: 100,
    })
      .then((res) => {
        if (cancelled) return;
        const formats = (res.data || []).map((row) => ({
          value: row.name,
          label: row.name,
        }));
        setPrintFormats([
          { value: "Standard", label: "Standard" },
          ...formats.filter((row) => row.value !== "Standard"),
        ]);
      })
      .catch(() => {
        if (!cancelled)
          setPrintFormats([{ value: "Standard", label: "Standard" }]);
      });
    return () => {
      cancelled = true;
    };
  }, [show, materialRequestName, t]);

  const loadInvitations = useCallback(async () => {
    if (!materialRequestName) return;
    setInvitationsLoading(true);
    try {
      const payload = await getMethod(INVITATIONS_METHOD, {
        material_request_name: materialRequestName,
      });
      setInvitations(payload.invitations || []);
    } catch (error) {
      toast.error(
        error.message || t("store.mr.supplierEmail.trackingLoadFailed"),
      );
    } finally {
      setInvitationsLoading(false);
    }
  }, [materialRequestName, t, toast]);

  useEffect(() => {
    if (!show) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvitations();
  }, [show, loadInvitations]);

  useEffect(() => {
    if (!show || !supplierKey) return;
    let cancelled = false;
    const key = supplierKey;
    getMethod(RECIPIENTS_METHOD, {
      material_request_name: materialRequestName,
      suppliers: JSON.stringify(suppliers),
    })
      .then((payload) => {
        if (!cancelled) {
          setRecipientState({ key, rows: payload.suppliers || [], error: "" });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setRecipientState({
          key,
          rows: [],
          error: error.message || t("store.mr.supplierEmail.contactsFailed"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [show, supplierKey, materialRequestName, suppliers, t]);

  const addSupplier = () => {
    if (!supplierCandidate || suppliers.includes(supplierCandidate)) return;
    setSuppliers((current) => [...current, supplierCandidate]);
    setSupplierCandidate("");
  };

  const recipientBySupplier = useMemo(
    () => new Map(recipients.map((row) => [row.supplier, row])),
    [recipients],
  );
  const contactsBlocked =
    recipientsLoading ||
    recipients.length !== suppliers.length ||
    recipients.some((row) => row.error);

  const send = async () => {
    if (
      !suppliers.length ||
      !subject.trim() ||
      !message.trim() ||
      contactsBlocked
    )
      return;
    try {
      setLoading(true);
      setResult(null);
      const response = await post(SEND_METHOD, {
        material_request_name: materialRequestName,
        suppliers: JSON.stringify(suppliers),
        print_format: printFormat,
        subject,
        message,
      });
      const payload = response.message || {};
      setResult(payload);
      setSuppliers([]);
      setRecipientState({ key: "", rows: [], error: "" });
      const sentCount = payload.sent?.length || 0;
      const failedCount = payload.failed?.length || 0;
      toast[failedCount ? "warning" : "success"](
        t("store.mr.supplierEmail.result", {
          sent: sentCount,
          failed: failedCount,
        }),
      );
      await loadInvitations();
    } catch (error) {
      toast.error(error.message || t("store.mr.supplierEmail.failed"));
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (method, invitationName, label) => {
    try {
      setActionLoading(invitationName);
      await post(method, { invitation_name: invitationName });
      toast.success(t(label));
      setRevoking(null);
      await loadInvitations();
    } catch (error) {
      toast.error(error.message || t("store.mr.supplierEmail.actionFailed"));
    } finally {
      setActionLoading("");
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <AppModal
        show={show}
        onClose={handleClose}
      title={t("store.mr.supplierEmail.title")}
      width="lg"
      footer={
        <>
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              {t("common.close")}
            </Button>
          <Button
            onClick={send}
            disabled={
              loading ||
              !suppliers.length ||
              !subject.trim() ||
              !message.trim() ||
              contactsBlocked
            }
          >
            {loading ? t("common.saving") : t("store.mr.supplierEmail.send")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <FormField label={t("store.mr.supplierEmail.supplier")}>
              <LinkField
                doctype="Supplier"
                value={supplierCandidate}
                onChange={setSupplierCandidate}
                filters={{ disabled: 0 }}
                placeholder={t("store.mr.supplierEmail.chooseSupplier")}
              />
            </FormField>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-[22px] self-start"
            onClick={addSupplier}
            disabled={!supplierCandidate}
          >
            <Plus />
            {t("store.mr.supplierEmail.addSupplier")}
          </Button>
        </div>

        {suppliers.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("store.mr.supplierEmail.contactsTitle")}
            </p>
            <ul
              className="flex flex-col gap-2"
              aria-label={t("store.mr.supplierEmail.selectedSuppliers")}
            >
              {suppliers.map((supplier) => {
                const contact = recipientBySupplier.get(supplier);
                return (
                  <li
                    key={supplier}
                    className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{supplier}</span>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {recipientsLoading
                          ? t("store.mr.supplierEmail.resolvingContacts")
                          : contact?.email ||
                            t("store.mr.supplierEmail.noContactEmail")}
                      </span>
                      {contact?.error ? (
                        <p className="text-xs text-destructive">
                          {contact.error}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSuppliers((current) =>
                          current.filter((item) => item !== supplier),
                        )
                      }
                      aria-label={t("common.remove")}
                      className="self-start rounded p-1 text-muted-foreground hover:bg-muted sm:self-auto"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {recipientsError ? (
              <p className="text-xs text-destructive">{recipientsError}</p>
            ) : null}
            {!recipientsLoading && contactsBlocked && !recipientsError ? (
              <p className="text-xs text-destructive">
                {t("store.mr.supplierEmail.contactsBlocked")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("store.mr.supplierEmail.noSuppliers")}
          </p>
        )}

        <FormField label={t("store.mr.supplierEmail.printFormat")}>
          <FormSelect
            value={printFormat}
            onChange={setPrintFormat}
            options={printFormats}
          />
        </FormField>
        <FormField label={t("store.mr.supplierEmail.subject")} required>
          <Input
            maxLength={140}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </FormField>
        <FormField label={t("store.mr.supplierEmail.message")} required>
          <Textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </FormField>

        {result ? (
          <div
            className={
              result.failed?.length
                ? "rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
                : "rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs"
            }
          >
            <p className="font-medium">
              {t("store.mr.supplierEmail.resultSummary", {
                sent: result.sent?.length || 0,
                failed: result.failed?.length || 0,
              })}
            </p>
            {result.failed?.length ? (
              <ul className="mt-1 list-disc ps-4">
                {result.failed.map((row, index) => (
                  <li key={`${row.supplier}-${index}`}>
                    {row.supplier}: {row.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {t("store.mr.supplierEmail.trackingTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("store.mr.supplierEmail.trackingHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadInvitations}
              disabled={invitationsLoading}
            >
              <RefreshCw
                className={`size-3.5 ${invitationsLoading ? "animate-spin" : ""}`}
              />
              {t("store.mr.supplierEmail.refresh")}
            </Button>
          </div>

          {invitations.length ? (
            <ul className="flex flex-col gap-2">
              {invitations.map((invitation) => {
                const busy = actionLoading === invitation.name;
                return (
                  <li
                    key={invitation.name}
                    className="flex flex-col gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {invitation.supplier_name || invitation.supplier}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {invitation.recipient_email}
                          {invitation.supplier_quotation
                            ? ` · ${invitation.supplier_quotation}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateTone(invitation.state)}`}
                      >
                        {invitation.state}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {invitation.sent_on
                        ? t("store.mr.supplierEmail.sentOn", {
                            value: invitation.sent_on,
                          })
                        : t("store.mr.supplierEmail.notSent")}
                      {invitation.state === "Responded" &&
                      invitation.notification_status
                        ? ` · ${t("store.mr.supplierEmail.notification", {
                            value:
                              invitation.notification_error ||
                              invitation.notification_status,
                          })}`
                        : ""}
                      {invitation.last_error
                        ? ` · ${invitation.last_error}`
                        : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {revoking === invitation.name ? (
                        <>
                          <span className="self-center text-xs text-destructive">
                            {t("store.mr.supplierEmail.revokeConfirm")}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setRevoking(null)}
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                REVOKE_METHOD,
                                invitation.name,
                                "store.mr.supplierEmail.revoked",
                              )
                            }
                          >
                            {t("store.mr.supplierEmail.revoke")}
                          </Button>
                        </>
                      ) : (
                        <>
                          {ACTIVE_STATES.has(invitation.state) ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    RESEND_METHOD,
                                    invitation.name,
                                    "store.mr.supplierEmail.resent",
                                  )
                                }
                              >
                                {t("store.mr.supplierEmail.resend")}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => setRevoking(invitation.name)}
                              >
                                {t("store.mr.supplierEmail.revoke")}
                              </Button>
                            </>
                          ) : null}
                          {["Revoked", "Expired", "Responded"].includes(
                            invitation.state,
                          ) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  REOPEN_METHOD,
                                  invitation.name,
                                  "store.mr.supplierEmail.reopened",
                                )
                              }
                            >
                              {t("store.mr.supplierEmail.reopen")}
                            </Button>
                          ) : null}
                          {invitation.state === "Responded" &&
                          invitation.notification_status === "Failed" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  RETRY_METHOD,
                                  invitation.name,
                                  "store.mr.supplierEmail.retried",
                                )
                              }
                            >
                              {t("store.mr.supplierEmail.retryNotification")}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              {invitationsLoading
                ? t("common.loading")
                : t("store.mr.supplierEmail.noInvitations")}
            </p>
          )}
        </div>
      </div>
    </AppModal>
  );
}
