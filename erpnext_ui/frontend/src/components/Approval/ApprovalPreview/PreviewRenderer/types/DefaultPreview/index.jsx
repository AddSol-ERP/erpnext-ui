import { BasePreview } from "..";

export default function DefaultPreview({ doc }) {
  return (
    <BasePreview title={doc.name} meta="Generic View">
      <pre>{JSON.stringify(doc, null, 2)}</pre>
    </BasePreview>
  );
}
