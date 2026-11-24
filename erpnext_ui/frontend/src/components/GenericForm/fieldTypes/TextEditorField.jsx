import { useEffect, useRef } from "react";

const ALLOWED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H1", "H2", "H3", "I",
  "LI", "OL", "P", "PRE", "S", "STRONG", "U", "UL",
]);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeHtml(value) {
  const html = String(value || "");
  if (typeof DOMParser === "undefined") return escapeHtml(html);

  const document = new DOMParser().parseFromString(html, "text/html");
  for (const element of [...document.body.querySelectorAll("*")]) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const safeLink = element.tagName === "A" && attribute.name === "href" &&
        /^(https?:|mailto:|\/|#)/i.test(attribute.value.trim());
      if (!safeLink) element.removeAttribute(attribute.name);
    }
  }
  return document.body.innerHTML;
}

export default function TextEditorField({ field, value, onChange, error, disabled = false }) {
  const editorRef = useRef(null);
  const html = sanitizeHtml(value);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) editor.innerHTML = html;
  }, [html]);

  const handleInput = (event) => {
    const editor = event.currentTarget;
    const sanitized = sanitizeHtml(editor.innerHTML);
    if (editor.innerHTML !== sanitized) editor.innerHTML = sanitized;
    onChange(sanitized);
  };

  return (
    <div
      ref={editorRef}
      id={field.fieldname}
      role="textbox"
      aria-label={field.label || field.fieldname}
      aria-multiline="true"
      aria-invalid={!!error}
      contentEditable={!disabled && !field.read_only}
      suppressContentEditableWarning
      onInput={handleInput}
      className={`min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${disabled || field.read_only ? "bg-muted/40 text-muted-foreground" : ""} ${error ? "border-destructive" : ""}`}
    />
  );
}
