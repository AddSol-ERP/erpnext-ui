import { useTranslation } from "react-i18next";
import { statusTone } from "@/components/List/statusTones";
import SummaryBand from "../shared/SummaryBand";
import FinancialSummary from "../shared/FinancialSummary";
import PaymentTerms from "../shared/PaymentTerms";
import TermsAndConditions from "../shared/TermsAndConditions";
import ItemTable from "../shared/ItemTable";
import Addresses from "../shared/Addresses";

/** Local ISO date (not UTC) so "expired" flips at the user's midnight. */
function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Quotation approval preview.
 *
 * ORDER IS THE POINT. A senior approver reads: who/what/how much (summary
 * band), how they get paid and the money breakdown, the terms they are signing,
 * then the items. Items are last on purpose -- they are the supporting detail,
 * and the compact table means they are still only a short scroll away. The old
 * layout put the items first as cards, so a six-line quotation pushed the
 * payment terms and the terms & conditions below two screens of item text.
 *
 * ONE SCROLL CONTAINER. `AppModal` already caps its body at 95vh and scrolls it.
 * `BasePreview` added a second scroll frame inside that, and this preview then
 * added two more (`max-h-[60vh]` items, `max-h-[120px]` terms). Nested
 * scrollbars are unusable on a phone and can trap the wheel on desktop, so this
 * view renders sections directly into the modal body; only long legal terms
 * keep a bounded inner scroll.
 */
export default function QuotationPreview({ doc }) {
  const { t } = useTranslation();

  const currency = doc.currency;
  // Quotation v15 has no `customer` column: the party is `party_name` (Dynamic
  // Link) with `customer_name` as the readable label. Reading `doc.customer`
  // silently rendered undefined and fell through to the raw party code.
  const customer = doc.customer_name || doc.party_name || doc.title;
  const state = doc.workflow_state || doc.status || "";

  const isExpired = Boolean(
    doc.valid_till && String(doc.valid_till).slice(0, 10) < todayIso(),
  );

  const contacts = [doc.contact_display, doc.contact_mobile, doc.contact_email];

  // Only fields with a value: a facts grid padded with "—" reads as a broken
  // document, and these are optional on a quotation.
  const facts = [
    { label: t("approvals.preview.quotationTo"), value: doc.quotation_to },
    { label: t("approvals.preview.quotationDate"), value: doc.transaction_date },
    { label: t("approvals.preview.validTill"), value: doc.valid_till },
    { label: t("approvals.preview.opportunity"), value: doc.opportunity },
    { label: t("approvals.preview.orderType"), value: doc.order_type },
    { label: t("approvals.preview.incoterm"), value: doc.incoterm },
  ].filter((fact) => fact.value);

  const badges = [
    ...(state ? [{ label: state, tone: statusTone(state) }] : []),
    ...(isExpired
      ? [{ label: t("approvals.preview.expired"), tone: "danger" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <SummaryBand
        name={doc.name}
        heading={customer}
        subheading={doc.title}
        contacts={contacts}
        facts={facts}
        badges={badges}
        total={doc.rounded_total || doc.grand_total}
        currency={currency}
        inWords={doc.in_words}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <FinancialSummary doc={doc} currency={currency} />
        </div>

        <div className="lg:col-span-7">
          <PaymentTerms
            schedule={doc.payment_schedule}
            template={doc.payment_terms_template}
            currency={currency}
          />
        </div>
      </div>

      <TermsAndConditions html={doc.terms} template={doc.tc_name} />

      <ItemTable key={doc.name} items={doc.items} currency={currency} />

      <Addresses
        blocks={[
          {
            title: t("approvals.preview.customer"),
            html: doc.address_display,
          },
          {
            title: t("approvals.preview.shipping"),
            html: doc.shipping_address_display,
          },
        ]}
      />
    </div>
  );
}
