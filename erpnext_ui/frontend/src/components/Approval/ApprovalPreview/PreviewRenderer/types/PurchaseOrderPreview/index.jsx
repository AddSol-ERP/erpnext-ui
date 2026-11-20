import { useTranslation } from "react-i18next";
import { statusTone } from "@/components/List/statusTones";
import SummaryBand from "../shared/SummaryBand";
import FinancialSummary from "../shared/FinancialSummary";
import PaymentTerms from "../shared/PaymentTerms";
import TermsAndConditions from "../shared/TermsAndConditions";
import ItemTable from "../shared/ItemTable";
import Addresses from "../shared/Addresses";

/**
 * Purchase Order approval preview.
 *
 * Deliberately the same composition as `QuotationPreview`: same summary band,
 * same commercial cards above the items, same compact line table. An approver
 * who works both queues should not have to relearn the screen per doctype, and
 * keeping the two as separate files is what lets their facts rows differ
 * (supplier / Required By vs customer / Valid Till) without branching.
 *
 * Commercial terms stay above the items -- the original PO layout made that
 * choice explicitly, and it is right for the same reason a quote is approved on
 * its payment schedule rather than on its item list.
 */
export default function PurchaseOrderPreview({ doc }) {
  const { t } = useTranslation();

  const currency = doc.currency;
  const supplier = doc.supplier_name || doc.supplier || doc.title;
  const state = doc.workflow_state || doc.status || "";

  const contacts = [doc.contact_display, doc.contact_mobile, doc.contact_email];

  // Received/billed progress is only interesting once it has moved off zero:
  // a fresh draft is always 0/0, and two "0 %" cells in the facts grid read as
  // missing data rather than as "nothing delivered yet".
  const percent = (value) => {
    const amount = Number(value) || 0;
    return amount > 0 ? `${amount}%` : null;
  };

  const facts = [
    { label: t("approvals.preview.transactionDate"), value: doc.transaction_date },
    { label: t("approvals.preview.requiredBy"), value: doc.schedule_date },
    { label: t("approvals.preview.company"), value: doc.company },
    { label: t("approvals.preview.projectHeader"), value: doc.project },
    {
      label: t("approvals.preview.orderConfirmation"),
      value: doc.order_confirmation_no,
    },
    { label: t("approvals.preview.incoterm"), value: doc.incoterm },
    { label: t("approvals.preview.received"), value: percent(doc.per_received) },
    { label: t("approvals.preview.billed"), value: percent(doc.per_billed) },
  ].filter((fact) => fact.value);

  return (
    <div className="flex flex-col gap-3">
      <SummaryBand
        name={doc.name}
        heading={supplier}
        subheading={doc.title}
        contacts={contacts}
        facts={facts}
        badges={state ? [{ label: state, tone: statusTone(state) }] : []}
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
            title: t("approvals.preview.supplier"),
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
