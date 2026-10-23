"""Email hooks for app-owned supplier quotation messages."""

import re
from email.mime.text import MIMEText

FOOTER_HEADER = "X-ERPNext-UI-Supplier-Quotation"


def remove_erpnext_footer_from_supplier_quotation_email(mail):
	"""Remove ERPNext's global email footer only from this app's marked emails."""
	if mail.msg_root.get(FOOTER_HEADER) != "1":
		return

	for parent in mail.msg_root.walk():
		if not parent.is_multipart():
			continue
		for index, part in enumerate(list(parent.get_payload())):
			content_type = part.get_content_type()
			if content_type not in ("text/html", "text/plain"):
				continue

			payload = part.get_payload(decode=True)
			if payload is None:
				continue
			charset = part.get_content_charset() or "utf-8"
			content = payload.decode(charset, errors="replace")
			if content_type == "text/html":
				content = re.sub(
					r'(?is)<div\b(?=[^>]*\bclass=["\'][^"\']*\bdefault-mail-footer\b)[^>]*>.*?</div\s*>',
					"",
					content,
				)
			else:
				content = re.sub(r"(?i)sent\s+via\s+erpnext\.?", "", content)
				content = re.sub(r"(?i)https?://frappe\.io/erpnext\?[^\s]+", "", content)

			replacement = MIMEText(content, content_type.split("/", 1)[1], charset)
			for key, value in part.items():
				if key.lower() not in {"content-type", "content-transfer-encoding", "mime-version"}:
					replacement[key] = value
			parent.replace(part, replacement)
