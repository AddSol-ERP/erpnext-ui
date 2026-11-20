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

class AnalysisCacheTests(unittest.TestCase):
	def setUp(self):
		import copy
		import hashlib
		import json
		from contextlib import nullcontext
		self.data = {"company": "Example", "quotations": [{"name": "B", "rate": 2}, {"name": "A", "rate": 1}]}
		self.compare = Mock(side_effect=lambda names: copy.deepcopy(self.data))
		self.settings = types.SimpleNamespace(provider="OpenRouter", model="openrouter/free", response_language="English", timeout_seconds=30)
		self.values = {}
		self.cache = types.SimpleNamespace(
			get_value=lambda key, **kwargs: self.values.get(key),
			set_value=lambda key, value, **kwargs: self.values.update({key: value}),
			make_key=lambda key: key, lock=lambda *args, **kwargs: types.SimpleNamespace(acquire=lambda: True, release=lambda: None),
		)
		self.request = Mock(return_value="analysis")
		self.context = {"compare_quotations": self.compare, "_settings": lambda: (self.settings, "secret"),
			"frappe": types.SimpleNamespace(session=types.SimpleNamespace(user="buyer"), cache=lambda: self.cache,
				get_doc=lambda data: types.SimpleNamespace(name="QAI-1", insert=lambda **kwargs: None),
				as_json=json.dumps, flags=types.SimpleNamespace(),
				db=types.SimpleNamespace(after_commit=types.SimpleNamespace(add=lambda fn: fn()), after_rollback=types.SimpleNamespace(add=lambda fn: None))),
			"json": json, "hashlib": hashlib, "_request": self.request, "ANALYSIS_CACHE_SECONDS": 100}
		node = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == "evaluate_quotations")
		node.decorator_list = []
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), self.context)

	def test_reuses_identical_data_but_checks_access_each_time(self):
		evaluate = self.context["evaluate_quotations"]
		self.assertFalse(evaluate(["A", "B"])["cached"])
		self.assertTrue(evaluate(["B", "A"])["cached"])
		self.assertEqual(self.compare.call_count, 2)
		self.assertEqual(self.request.call_count, 1)

	def test_changed_data_model_or_user_requires_new_analysis(self):
		evaluate = self.context["evaluate_quotations"]
		evaluate(["A", "B"])
		self.data["quotations"][0]["rate"] = 3
		evaluate(["A", "B"])
		self.settings.model = "new-model"
		evaluate(["A", "B"])
		self.context["frappe"].session.user = "another-buyer"
		evaluate(["A", "B"])
		self.assertEqual(self.request.call_count, 4)

	def test_errors_are_not_cached(self):
		self.request.side_effect = [ValueError("failed"), "ok"]
		with self.assertRaises(ValueError):
			self.context["evaluate_quotations"](["A", "B"])
		self.assertFalse(self.context["evaluate_quotations"](["A", "B"])["cached"])
