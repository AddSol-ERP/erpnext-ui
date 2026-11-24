import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, CheckSquare, CircleHelp, Clock3, Info, ListTodo } from "lucide-react";
import { getMethod } from "../../services/api";
import { openInDesk } from "../../lib/deskUrl";
import TodoHelpDialog from "./TodoHelpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(value, language) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getTaskColor(value) {
  const color = String(value || "").trim();
  return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color) ? color : null;
}

function TodoSection({ title, todos, count, icon, tone, emptyText, onOpen, t, language }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center gap-2 bg-muted/35 px-2.5 py-1.5">
        {icon === CheckSquare ? (
          <CheckSquare className={`size-3.5 ${tone}`} />
        ) : (
          <Info className={`size-3.5 ${tone}`} />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <Badge variant="secondary" className="ms-auto rounded-full px-2 py-0 text-xs tabular-nums">
          {count}
        </Badge>
      </div>
      {count ? (
        <div className="max-h-36 divide-y divide-border/70 overflow-y-auto overscroll-contain">
          {todos.map((todo) => {
          const dueDate = formatDate(todo.date, language);
          const taskColor = getTaskColor(todo.color);
          return (
            <button
              type="button"
              key={todo.name}
              onClick={() => onOpen(todo)}
              className="group flex w-full items-center gap-2 border-s-4 border-s-transparent px-2.5 py-1.5 text-start transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              style={{ borderInlineStartColor: taskColor || undefined }}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary ${tone}`}
                style={{ color: taskColor || undefined }}
              >
                {icon === CheckSquare ? (
                  <CheckSquare className="size-3.5" />
                ) : (
                  <Info className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight text-foreground">
                  {todo.description || todo.reference_name || todo.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {todo.reference_type && (
                    <span>{todo.reference_type}{todo.reference_name ? ` · ${todo.reference_name}` : ""}</span>
                  )}
                  {dueDate && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" />
                      {t("dashboard.myTodos.due", { date: dueDate })}
                    </span>
                  )}
                </span>
              </span>
              {todo.priority && todo.priority !== "Medium" && (
                <Badge
                  variant={todo.priority === "High" ? "destructive" : "outline"}
                  className="hidden shrink-0 sm:inline-flex"
                >
                  {t(`dashboard.myTodos.priority.${todo.priority.toLowerCase()}`)}
                </Badge>
              )}
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          );
          })}
        </div>
      ) : (
        <div className="flex min-h-9 items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      )}
    </section>
  );
}

export default function MyTodos() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [actionTodos, setActionTodos] = useState([]);
  const [informationTodos, setInformationTodos] = useState([]);
  const [actionCount, setActionCount] = useState(0);
  const [informationCount, setInformationCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let active = true;

    getMethod("method/erpnext_ui.api.get_my_open_todos")
      .then((result) => {
        if (!active) return;
        const hasGroupedResponse =
          Array.isArray(result.action_needed_todos) ||
          Array.isArray(result.information_todos);

        if (hasGroupedResponse) {
          const actionRows = Array.isArray(result.action_needed_todos)
            ? result.action_needed_todos
            : [];
          const informationRows = Array.isArray(result.information_todos)
            ? result.information_todos
            : [];
          const nextActionCount = Number(result.action_needed_count) || actionRows.length;
          const nextInformationCount = Number(result.information_count) || informationRows.length;

          setActionTodos(actionRows);
          setInformationTodos(informationRows);
          setActionCount(nextActionCount);
          setInformationCount(nextInformationCount);
          setTotal(Number(result.total) || nextActionCount + nextInformationCount);
        } else {
          // A web worker can still serve the pre-grouping endpoint response
          // until its Python module reloads. Those rows were all Action Needed.
          const legacyRows = Array.isArray(result.todos) ? result.todos : [];
          const actionRows = legacyRows.filter(
            (todo) => Number(todo.custom_for_information_only) !== 1,
          );
          const informationRows = legacyRows.filter(
            (todo) => Number(todo.custom_for_information_only) === 1,
          );

          setActionTodos(actionRows);
          setInformationTodos(informationRows);
          setActionCount(actionRows.length);
          setInformationCount(informationRows.length);
          setTotal(Number(result.total) || legacyRows.length);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch assigned ToDos:", error);
        if (active) {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openTodo = (todo) => openInDesk("ToDo", todo.name);

  return (
    <Card className="overflow-hidden rounded-xl border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.06] shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ListTodo className="size-3.5" />
            </div>
            <h2 className="truncate text-sm font-semibold">{t("dashboard.myTodos.title")}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={t("dashboard.myTodos.helpButton")}
              title={t("dashboard.myTodos.helpButton")}
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="size-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[11px] tabular-nums">
              {loading ? "…" : total}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => navigate("/ess/todo")}
            >
              {t("dashboard.myTodos.viewAll")}
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4" aria-label={t("dashboard.myTodos.loading")}>
            {[0, 1].map((row) => (
              <div key={row} className="h-9 animate-pulse rounded-lg bg-muted/70" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="px-4 py-5 text-center text-sm text-muted-foreground">
            {t("dashboard.myTodos.loadFailed")}
          </div>
        ) : total ? (
          <div className="grid gap-2 p-2.5 md:grid-cols-2">
            <TodoSection
              title={t("dashboard.myTodos.actionNeeded")}
              todos={actionTodos}
              count={actionCount}
              icon={CheckSquare}
              tone="text-amber-600"
              emptyText={t("dashboard.myTodos.emptySection")}
              onOpen={openTodo}
              t={t}
              language={i18n.language}
            />
            <TodoSection
              title={t("dashboard.myTodos.forInformation")}
              todos={informationTodos}
              count={informationCount}
              icon={Info}
              tone="text-sky-600"
              emptyText={t("dashboard.myTodos.emptySection")}
              onOpen={openTodo}
              t={t}
              language={i18n.language}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-5 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckSquare className="size-4" />
            </span>
            <p className="text-sm font-medium">{t("dashboard.myTodos.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.myTodos.emptyDescription")}</p>
          </div>
        )}
        <TodoHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      </CardContent>
    </Card>
  );
}
