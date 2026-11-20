import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DOCSTATUS_STATES, getApprovalMeta } from "../../../lib/approvalMeta";

/**
 * The "Details" view behind the preview toggle.
 *
 * It used to print `Object.entries(doc)` -- around 130 raw snake_case keys and
 * every child-table array, dumped as text. On a document an executive is being
 * asked to approve that reads as debug output, not as information.
 *
 * What an approver actually wants here is the handful of facts the preview does
 * NOT already show: which company issued it, the price list it was built from,
 * the tax template, who owns it and when it last changed. Those are curated per
 * doctype below, labelled with the DocType's own field labels (from meta, so
 * custom renames are respected) and laid out as a definition grid. Missing
 * values are skipped rather than shown as "—".
 *
 * Doctypes without a curated list keep the old raw dump -- deliberately, so
 * this change cannot alter a screen nobody asked about -- but now against the
 * FULL document, which the parent fetches once for both views.
 */
const DETAIL_SECTIONS = {
  Quotation: [
    {
      titleKey: "approvals.details.commercial",
      fields: [
        "company",
        "order_type",
        "incoterm",
        "named_place",
        "customer_group",
        "territory",
        "currency",
        "selling_price_list",
        "taxes_and_charges",
        "tax_category",
      ],
    },
    {
      titleKey: "approvals.details.people",
      fields: [
        "contact_person",
        "contact_display",
        "contact_mobile",
        "contact_email",
        "payment_terms_template",
        "tc_name",
        "letter_head",
        "language",
      ],
    },
    {
      titleKey: "approvals.details.audit",
      fields: [
        "owner",
        "creation",
        "modified",
        "modified_by",
        "docstatus",
        "amended_from",
      ],
    },
  ],
  "Purchase Order": [
    {
      titleKey: "approvals.details.commercial",
      fields: [
        "company",
        "project",
        "cost_center",
        "currency",
        "buying_price_list",
        "taxes_and_charges",
        "tax_category",
        "order_confirmation_no",
        "order_confirmation_date",
        "incoterm",
        "named_place",
      ],
    },
    {
      titleKey: "approvals.details.people",
      fields: [
        "contact_person",
        "contact_display",
        "contact_mobile",
        "contact_email",
        "payment_terms_template",
        "tc_name",
        "letter_head",
        "language",
      ],
    },
    {
      titleKey: "approvals.details.audit",
      fields: [
        "owner",
        "creation",
        "modified",
        "modified_by",
        "docstatus",
        "amended_from",
        "ref_sq",
      ],
    },
  ],
};

/** `modified_by` -> "Modified By", for implicit fields meta does not report. */
const prettify = (fieldname) =>
  String(fieldname)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function displayValue(value, t) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  return String(value);
}

export default function DetailsPanel({ doctype, doc }) {
  const { t } = useTranslation();
  const [labels, setLabels] = useState({});

  useEffect(() => {
    let cancelled = false;

    getApprovalMeta(doctype).then((meta) => {
      if (cancelled || !meta?.fields) return;
      setLabels(
        Object.fromEntries(
          meta.fields.map((field) => [field.fieldname, field.label]),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [doctype]);

  const sections = DETAIL_SECTIONS[doctype];

  if (!sections) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(doc).map(([key, value]) => {
          if (value && typeof value === "object") return null;
          const shown = displayValue(value, t);
          if (shown === null) return null;

          return (
            <div key={key} className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {prettify(key)}
              </div>
              <div className="break-words text-sm">{shown}</div>
            </div>
          );
        })}
      </div>
    );
  }

  const rendered = sections
    .map((section) => ({
      ...section,
      rows: section.fields
        .map((fieldname) => {
          let value = doc[fieldname];
          if (fieldname === "docstatus") {
            value = DOCSTATUS_STATES[Number(value)] ?? value;
          }

          const shown = displayValue(value, t);
          if (shown === null) return null;

          return {
            fieldname,
            label: labels[fieldname] || prettify(fieldname),
            value: shown,
          };
        })
        .filter(Boolean),
    }))
    .filter((section) => section.rows.length > 0);

  if (rendered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("approvals.details.noExtraInfo")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {rendered.map((section) => (
        <section key={section.titleKey}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(section.titleKey)}
          </h3>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.rows.map((row) => (
              <div key={row.fieldname} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="break-words text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
