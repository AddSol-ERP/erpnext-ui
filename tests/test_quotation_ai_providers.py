"""Provider request contracts without requiring a Frappe site or API key."""
import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

source = Path(__file__).resolve().parents[1] / "erpnext_ui/quotation_ai.py"
nodes = [node for node in ast.parse(source.read_text()).body if isinstance(node, ast.FunctionDef) and node.name == "_request"]


class ProviderRequestTests(unittest.TestCase):
	def setUp(self):
		self.response = Mock(ok=True)
		self.requests = types.SimpleNamespace(post=Mock(return_value=self.response), RequestException=Exception)
		self.frappe = types.SimpleNamespace(throw=Mock(side_effect=ValueError))
		self.context = {
			"requests": self.requests, "frappe": self.frappe, "_": lambda text: text,
			"PROVIDERS": {"openrouter": ("OpenRouter", "https://openrouter.ai/api/v1/chat/completions"),
				"openai": ("OpenAI", "https://api.openai.com/v1/responses")},
			"_error_message": lambda response: "provider error",
		}
		exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), self.context)

	def test_openrouter_uses_chat_messages_and_parses_response(self):
		self.response.json.return_value = {"choices": [{"finish_reason": "stop", "message": {"content": "Analysis"}}]}
		settings = types.SimpleNamespace(provider="OpenRouter", model="openrouter/free", timeout_seconds=30)
		self.assertEqual(self.context["_request"](settings, "secret", "instructions", "data"), "Analysis")
		args, kwargs = self.requests.post.call_args
		self.assertEqual(args[0], "https://openrouter.ai/api/v1/chat/completions")
		self.assertEqual(kwargs["json"]["messages"], [{"role": "system", "content": "instructions"}, {"role": "user", "content": "data"}])
		self.assertFalse(kwargs["allow_redirects"])

	def test_openrouter_rejects_incomplete_response(self):
		self.response.json.return_value = {"choices": [{"finish_reason": "length", "message": {"content": "Partial"}}]}
		with self.assertRaises(ValueError):
			self.context["_request"](types.SimpleNamespace(provider="OpenRouter", model="test", timeout_seconds=30), "secret", "", "")

	def test_openai_response_contract_remains_supported(self):
		self.response.json.return_value = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "OK"}]}]}
		settings = types.SimpleNamespace(provider="OpenAI", model="test", timeout_seconds=30)
		self.assertEqual(self.context["_request"](settings, "secret", "instructions", "data"), "OK")
		self.assertEqual(self.requests.post.call_args.kwargs["json"]["input"], "data")


if __name__ == "__main__":
	unittest.main()
