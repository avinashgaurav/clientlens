"""Gemini model fallback (api/routes/llm.py), against a mocked Google API.

Run from backend/: python -m unittest discover -s tests
"""
import asyncio
import json
import os
import unittest

# config.py needs these at import; the tests never reach Supabase.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

import httpx  # noqa: E402

from api.routes import llm  # noqa: E402

SPENT = json.dumps({"error": {"code": 429, "message": "Free Tier", "details": [
    {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}})
OK_JSON = {"candidates": [{"content": {"parts": [{"text": "pong"}]}}],
           "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 1, "thoughtsTokenCount": 2}}
OK_SSE = "data: " + json.dumps(OK_JSON) + "\n\n"


class GeminiFallbackTest(unittest.TestCase):
    def setUp(self):
        self.calls: list[str] = []
        self.responses: dict[str, httpx.Response] = {}
        llm._gemini_spent.clear()
        llm.settings.gemini_api_key = "test"
        llm._GEMINI_RETRY_DELAYS = (0.0, 0.0)

        def handler(request: httpx.Request) -> httpx.Response:
            model = request.url.path.split("/models/")[1].split(":")[0]
            self.calls.append(model)
            self.bodies.append(json.loads(request.content))
            if model in self.responses:
                r = self.responses[model]
                return httpx.Response(r.status_code, text=r.text)
            return httpx.Response(200, text=OK_SSE) if "stream" in request.url.path else httpx.Response(200, json=OK_JSON)

        self.bodies: list[dict] = []
        llm._httpx_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.req = llm.LLMRequest(provider="gemini", model="gemini-3.6-flash", user="hi", max_tokens=20)

        async def no_log(**_):
            return None
        self._orig_log, llm._log_usage = llm._log_usage, no_log

    def tearDown(self):
        llm._log_usage = self._orig_log

    def run_stream(self) -> str:
        async def collect():
            return b"".join([c async for c in llm._stream_gemini(self.req, "u", None)]).decode()
        return asyncio.run(collect())

    def test_spent_model_falls_back_once_then_is_skipped(self):
        self.responses["gemini-3.6-flash"] = httpx.Response(429, text=SPENT)
        r = asyncio.run(llm._complete_gemini(self.req))
        self.assertEqual(r.model, "gemini-3-flash-preview")
        self.assertEqual(self.calls, ["gemini-3.6-flash", "gemini-3-flash-preview"])
        self.assertEqual(r.usage.output_tokens, 3, "thinking tokens count as output")
        self.calls.clear()
        asyncio.run(llm._complete_gemini(self.req))
        self.assertEqual(self.calls, ["gemini-3-flash-preview"])

    def test_retired_model_404_falls_back(self):
        self.responses["gemini-3.6-flash"] = httpx.Response(404, text="models/x is no longer available to new users")
        self.assertEqual(asyncio.run(llm._complete_gemini(self.req)).model, "gemini-3-flash-preview")

    def test_brief_overload_retries_same_model(self):
        self.responses["gemini-3.6-flash"] = httpx.Response(503, text="high demand")
        r = asyncio.run(llm._complete_gemini(self.req))
        self.assertEqual(self.calls[:3], ["gemini-3.6-flash"] * 3, "two retries on the same model first")
        self.assertEqual(r.model, "gemini-3-flash-preview", "then the next model")

    def test_all_models_spent_is_a_clean_503(self):
        for m in llm._gemini_candidates("gemini-3.6-flash"):
            self.responses[m] = httpx.Response(429, text=SPENT)
        with self.assertRaises(llm.HTTPException) as ctx:
            asyncio.run(llm._complete_gemini(self.req))
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail, llm._GEMINI_EXHAUSTED)

    def test_stream_falls_back_and_reports_served_model(self):
        self.responses["gemini-3.6-flash"] = httpx.Response(429, text=SPENT)
        out = self.run_stream()
        self.assertIn("event: delta", out)
        done = json.loads(out.split("event: done\ndata: ")[1].split("\n")[0])
        self.assertEqual(done["model"], "gemini-3-flash-preview")
        self.assertEqual(self.calls, ["gemini-3.6-flash", "gemini-3-flash-preview"])

    def test_stream_all_spent_sends_clean_error(self):
        for m in llm._gemini_candidates("gemini-3.6-flash"):
            self.responses[m] = httpx.Response(429, text=SPENT)
        out = self.run_stream()
        self.assertIn("event: error", out)
        self.assertIn(llm._GEMINI_EXHAUSTED, out)
        self.assertNotIn("event: delta", out)

    def test_thinking_level_only_where_accepted(self):
        for model, expected in [("gemini-3.6-flash", True), ("gemini-3.5-flash-lite", True),
                                ("gemini-flash-lite-latest", True), ("gemini-3.1-pro-preview", False),
                                ("gemini-pro-latest", False), ("gemini-flash-latest", False),
                                ("gemini-2.5-flash", False), ("gemini-embedding-001", False)]:
            self.assertEqual(llm._takes_thinking_level(model), expected, model)

    def test_fallbacks_outside_the_allowlist_are_ignored(self):
        orig = llm.GEMINI_FALLBACK_MODELS
        try:
            llm.GEMINI_FALLBACK_MODELS = ("not-a-real-model", "gemini-3.5-flash-lite")
            self.assertEqual(llm._gemini_candidates("gemini-3.6-flash"), ["gemini-3.6-flash", "gemini-3.5-flash-lite"])
        finally:
            llm.GEMINI_FALLBACK_MODELS = orig


if __name__ == "__main__":
    unittest.main()


class UnbilledReleaseTest(unittest.TestCase):
    """A call the provider refused before generating releases its reservation."""

    def setUp(self):
        self.updates: list[dict] = []
        test = self

        class Table:
            def update(self, data):
                test.updates.append(data)
                return self

            def eq(self, *_):
                return self

            def execute(self):
                return None

        class Client:
            def table(self, _):
                return Table()

        self._orig = llm.supabase_client
        llm.supabase_client = lambda: Client()
        llm.settings.dev_mode = False

    def tearDown(self):
        llm.supabase_client = self._orig

    def log(self, **kw):
        base = dict(user_id="u", provider="gemini", model="m", input_tokens=0, output_tokens=0,
                    duration_ms=1, streamed=False, reservation="r1")
        asyncio.run(llm._log_usage(**{**base, **kw}))
        return self.updates[-1]

    def test_unbilled_failure_releases_the_estimate(self):
        u = self.log(error="http_429", billed=False)
        self.assertEqual((u["input_tokens"], u["output_tokens"]), (0, 0))

    def test_billed_failure_keeps_the_estimate(self):
        u = self.log(error="timeout", billed=True)
        self.assertNotIn("input_tokens", u)

    def test_success_records_real_counts(self):
        u = self.log(input_tokens=12, output_tokens=3)
        self.assertEqual((u["input_tokens"], u["output_tokens"]), (12, 3))

    def test_unbilled_statuses(self):
        self.assertTrue(llm._unbilled(llm.HTTPException(status_code=429)))
        self.assertTrue(llm._unbilled(llm.HTTPException(status_code=503)))
        self.assertFalse(llm._unbilled(llm.HTTPException(status_code=502)))
        self.assertFalse(llm._unbilled(RuntimeError("network")))
