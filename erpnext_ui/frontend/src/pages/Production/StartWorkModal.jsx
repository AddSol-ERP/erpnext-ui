import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cog, ClipboardList } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import AppModal from "../../components/AppModal";
import LinkField from "../../components/LinkField";
import { StatusBadge } from "../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { get } from "../../services/api";
import {
  JOB_CARD_ACTION_LABEL_KEY,
  JOB_CARD_ACTION_STYLE,
  JOB_CARD_DONE_TOAST_KEY,
  JOB_CARD_STATUS_UI,
  START_ACTION_KEYS,
  STARTABLE_JOB_CARD_STATUSES,
  STARTABLE_WORK_ORDER_STATUSES,
  WORK_ORDER_ACTION_LABEL_KEY,
  WORK_ORDER_ACTION_STYLE,
  WORK_ORDER_DONE_TOAST_KEY,
  WORK_ORDER_STATUS_UI,
  jobCardActionsFor,
  workOrderActionsFor,
} from "./actions";
import {
  reopenWorkOrder,
  resumeJobCard,
  startJobCard,
  startNextJobCard,
} from "./jobActions";

/** How much of each list the dialog shows; the dashboard's Browse all links
 * are the way to the rest. */
const PAGE_SIZE = 20;

/**
 * The one-button way onto the floor: pick a project, see everything that can
 * be STARTED for it, start it.
 *
 * Only "go" actions live here (`START_ACTION_KEYS`): pausing and completing
 * belong to work that is already running, which is the dashboard's job. The
 * lists are filtered to the startable statuses derived from the same matrix
 * (`actions.js`), so a row can always be acted on -- a status that merely
 * exists but cannot start, such as a partially transferred card, is left to
 * the waiting tab where its reason for waiting is visible.
 *
 * One dialog, never stacked on another: the dashboard opens this from the
 * toolbar, and no other overlay can be open while it is (MEMORY §9.8e).
 */
export default function StartWorkModal({
  show,
  onClose,
  project: initialProject,
  onStarted,
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [project, setProject] = useState(initialProject || "");
  const [jobCards, setJobCards] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);

  // Adopt the dashboard's current filter when the dialog opens, so "Start
  // work" continues the view the operator is already looking at rather than
  // asking the same question twice.
  useEffect(() => {
    if (show) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProject(initialProject || "");
    }
  }, [show, initialProject]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!show || !project) {
        setJobCards([]);
        setWorkOrders([]);
        setError(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const [cards, orders] = await Promise.all([
          get("resource/Job Card", {
            fields: JSON.stringify([
              "name",
              "work_order",
              "operation",
              "status",
            ]),
            filters: JSON.stringify([
              ["docstatus", "!=", 2],
              ["status", "in", STARTABLE_JOB_CARD_STATUSES],
              ["project", "=", project],
            ]),
            // sequence_id is the operation order WITHIN a work order, so
            // ordering by work_order then sequence gives each job's steps in
            // the order the floor runs them.
            order_by: "work_order asc, sequence_id asc",
            limit_page_length: PAGE_SIZE,
          }),
          get("resource/Work Order", {
            fields: JSON.stringify([
              "name",
              "production_item",
              "status",
              "qty",
              "produced_qty",
            ]),
            filters: JSON.stringify([
              ["docstatus", "!=", 2],
              ["status", "in", STARTABLE_WORK_ORDER_STATUSES],
              ["project", "=", project],
            ]),
            order_by: "modified desc",
            limit_page_length: PAGE_SIZE,
          }),
        ]);

        if (cancelled) return;
        setJobCards(cards.data || []);
        setWorkOrders(orders.data || []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // load only setStates after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      cancelled = true;
    };
  }, [show, project]);

  /* ===============================
     ACTIONS
  ============================== */

  const run = async (id, fn, successMsg) => {
    setBusy(id);
    try {
      await fn();
      toast.success(successMsg);
      // The started row has left the startable set, so the dialog's job is
      // done: close it and let the parent reload the dashboard, which is where
      // the running work is now shown.
      onStarted?.();
    } catch (e) {
      // ERPNext's own sentence ("Materials needs to be transferred...") is the
      // only explanation worth showing.
      console.error(e);
      toast.error(e?.message || t("production.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const runJobCardAction = (row, key) => {
    const fn =
      key === "start"
        ? () => startJobCard(row.name)
        : () => resumeJobCard(row.name);
    run(`jc:${row.name}:${key}`, fn, t(JOB_CARD_DONE_TOAST_KEY[key]));
  };

  const runWorkOrderAction = (row, key) => {
    if (key === "startNext") {
      run(
        `wo:${row.name}:${key}`,
        async () => {
          const started = await startNextJobCard(row.name);
          // Nothing ready: every remaining card is done or waiting on a later
          // operation. Throwing keeps one error path for both kinds of
          // refusal.
          if (!started) throw new Error(t("production.noJobCardReady"));
          toast.success(t("production.startedCardToast", { name: started }));
        },
        null,
      );
      return;
    }

    run(
      `wo:${row.name}:${key}`,
      () => reopenWorkOrder(row.name),
      t(WORK_ORDER_DONE_TOAST_KEY[key]),
    );
  };

  /* ===============================
     ROWS
  ============================== */

  const statusLabel = (map, status) => {
    const ui = map[status] || { labelKey: "production.statusUnknown", tone: "open" };
    return <StatusBadge tone={ui.tone}>{t(ui.labelKey)}</StatusBadge>;
  };

  const actionButtons = (kind, row, keys, labels, styles) =>
    keys
      .filter((key) => START_ACTION_KEYS.includes(key))
      .map((key) => {
        const id = `${kind}:${row.name}:${key}`;
        return (
          <Button
            key={key}
            size="sm"
            variant="outline"
            className={styles[key]}
            disabled={busy !== null}
            onClick={() =>
              kind === "jc"
                ? runJobCardAction(row, key)
                : runWorkOrderAction(row, key)
            }
          >
            {busy === id ? t("production.processing") : t(labels[key])}
          </Button>
        );
      });

  const row = (key, title, subtitle, badge, actions) => (
    <div
      key={key}
      className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
    >
      <div className="min-w-0 flex-grow">
        <div className="truncate text-sm font-semibold text-foreground">
          {title}
        </div>
        {subtitle ? (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {badge}
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );

  const empty =
    !loading && !error && jobCards.length === 0 && workOrders.length === 0;

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.startWorkTitle")}
      width="lg"
    >
      <div className="flex flex-col gap-4">
        {/* PROJECT — the whole point of the dialog: scope the queue to one
            job before starting anything. */}
        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted-foreground"
            htmlFor="start-work-project"
          >
            {t("production.projectFilter")}
          </label>
          <div id="start-work-project">
            <LinkField
              doctype="Project"
              value={project}
              onChange={setProject}
              placeholder={t("production.allProjects")}
            />
          </div>
        </div>

        {!project ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("production.startWorkHint")}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4 text-primary" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("production.loadFailed")}
          </div>
        ) : empty ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("production.nothingToStart")}
          </div>
        ) : (
          <>
            {jobCards.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Cog className="size-4 text-primary" />
                  {t("production.readyJobCards")}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({jobCards.length})
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  {jobCards.map((jc) =>
                    row(
                      jc.name,
                      jc.name,
                      t("production.jobSubtitle", {
                        operation: jc.operation || "-",
                        work_order: jc.work_order || "-",
                      }),
                      statusLabel(JOB_CARD_STATUS_UI, jc.status),
                      actionButtons(
                        "jc",
                        jc,
                        jobCardActionsFor(jc.status),
                        JOB_CARD_ACTION_LABEL_KEY,
                        JOB_CARD_ACTION_STYLE,
                      ),
                    ),
                  )}
                </div>
              </div>
            )}

            {workOrders.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ClipboardList className="size-4 text-primary" />
                  {t("production.readyWorkOrders")}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({workOrders.length})
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  {workOrders.map((wo) =>
                    row(
                      wo.name,
                      wo.name,
                      t("production.woQty", {
                        produced: wo.produced_qty || 0,
                        total: wo.qty || 0,
                      }),
                      statusLabel(WORK_ORDER_STATUS_UI, wo.status),
                      actionButtons(
                        "wo",
                        wo,
                        workOrderActionsFor(wo.status),
                        WORK_ORDER_ACTION_LABEL_KEY,
                        WORK_ORDER_ACTION_STYLE,
                      ),
                    ),
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppModal>
  );
}
