import { useEffect, useMemo, useState } from "react";
import { useHeader } from "../../context/HeaderContext";
import { useTranslation } from "react-i18next";
import ActionBar from "../../components/ActionBar";
import Pagination from "../../components/Pagination";
import ListLayout from "../../components/ListLayout";
import DataTable from "../../components/List/DataTable";
import { StatusBadge } from "../../components/List/StatusBadge";
import { ListRow } from "../../components/List/ListRow";

const STATUS_TONE = {
  open: "open",
  pending: "pending",
  complete: "complete",
};

const ROW_DEFS = [
  { title: "STE-0001", rowKey: "materialIssue", status: "open" },
  { title: "STE-0002", rowKey: "materialReceipt", status: "complete" },
  { title: "STE-0003", rowKey: "transferEntry", status: "pending" },
  { title: "STE-0004", rowKey: "repackEntry", status: "open" },
];

const DemoList = () => {
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const totalPages = 3;
  const PAGE_SIZE = 4;

  useEffect(() => {
    setHeader({
      title: t("demo.header.title"),
      subtitle: t("demo.header.subtitle"),
      actions: [
        { label: t("common.refresh"), variant: "btn-outline-primary" },
        { label: t("demo.actions.quickAction") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(
    () =>
      ROW_DEFS.map((r) => ({
        title: r.title,
        subtitle: t(`demo.rows.${r.rowKey}.subtitle`),
        meta: t(`demo.rows.${r.rowKey}.meta`),
        status: r.status,
        statusLabel: t(`demo.status.${r.status}`),
      })),
    [t],
  );

  const columns = useMemo(
    () => [
      {
        id: "title",
        header: t("common.name"),
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.subtitle}
            </div>
          </div>
        ),
      },
      {
        id: "meta",
        header: t("common.modified"),
        hideBelow: "md",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.meta}</span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={STATUS_TONE[row.status] || "open"}>
            {row.statusLabel}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  return (
    <ListLayout
      contentMode="auto"
      actionBar={<ActionBar debounce={0} />}
      cards={
        <div className="flex flex-col">
          {data.map((item, i) => (
            <ListRow
              key={item.title}
              item={item}
              index={(page - 1) * PAGE_SIZE + i + 1}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={data}
          rowKey={(row) => row.title}
          rowOffset={(page - 1) * PAGE_SIZE}
        />
      }
      pagination={
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
      isEmpty={data.length === 0}
      emptyTitle={t("common.noData")}
    />
  );
};

export default DemoList;
