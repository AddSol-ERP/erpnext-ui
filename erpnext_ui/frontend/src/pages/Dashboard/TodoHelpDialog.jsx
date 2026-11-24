import { useTranslation } from "react-i18next";
import AppModal from "../../components/AppModal";
import { Button } from "@/components/ui/button";
import guide from "../../../../../docs/my-todos-user-guide.md?raw";

function inlineContent(text) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
}

function renderGuide(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const className = level === 1
        ? "text-xl font-semibold tracking-tight"
        : level === 2
          ? "text-base font-semibold tracking-tight"
          : "text-sm font-semibold";
      const Heading = `h${level}`;
      blocks.push(
        <Heading key={`heading-${index}`} className={className}>
          {inlineContent(text)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    const listMatch = line.match(/^(?:[-*]\s+|\d+\.\s+)/);
    if (listMatch) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = itemLine.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/);
        if (!match || ordered !== /^\d+\./.test(itemLine)) break;
        items.push(<li key={`item-${index}`}>{inlineContent(match[1])}</li>);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List
          key={`list-${index}`}
          className={ordered ? "list-decimal space-y-1.5 ps-5" : "list-disc space-y-1.5 ps-5"}
        >
          {items}
        </List>,
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`} className="leading-relaxed text-muted-foreground">
        {inlineContent(paragraph.join(" "))}
      </p>,
    );
  }

  return blocks;
}

export default function TodoHelpDialog({ open, onClose }) {
  const { t } = useTranslation();

  return (
    <AppModal
      show={open}
      onClose={onClose}
      title={t("dashboard.myTodos.helpTitle")}
      width="xl"
      bodyClassName="space-y-4 text-sm"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <article className="space-y-4">{renderGuide(guide)}</article>
    </AppModal>
  );
}
