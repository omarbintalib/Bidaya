"""Thin LLM wrapper: Gemini (google-genai) or OpenAI behind the same `complete_json`.

Provider: LLM_PROVIDER=openai|gemini in rag/.env; if unset, OpenAI when OPENAI_API_KEY is set, else Gemini.
"""
import json, os, re, time

from corpus import RAG

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(RAG, '.env'))
except ImportError:
    pass

PROVIDER = os.environ.get('LLM_PROVIDER') or ('openai' if os.environ.get('OPENAI_API_KEY') else 'gemini')
if PROVIDER == 'openai':
    DEFAULT_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-6-luna')
    ROUTER_MODEL = os.environ.get('OPENAI_ROUTER_MODEL', DEFAULT_MODEL)
else:
    DEFAULT_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
    ROUTER_MODEL = os.environ.get('GEMINI_ROUTER_MODEL', DEFAULT_MODEL)
REASONING_EFFORT = os.environ.get('OPENAI_REASONING_EFFORT', 'low')           # OpenAI only: none|low|medium|high

TRANSIENT_CODES = (408, 409, 429, 500, 502, 503, 504)
TRANSIENT_ERRORS = ('RemoteProtocolError', 'ReadTimeout', 'ConnectError', 'ReadError',
                    'APIConnectionError', 'APITimeoutError', 'RateLimitError', 'InternalServerError')


class LLM:
    def __init__(self, model=None, provider=None):
        self.provider = provider or PROVIDER
        self.model = model or DEFAULT_MODEL
        self.reasoning_effort = REASONING_EFFORT
        if self.provider == 'openai':
            from openai import OpenAI
            if not os.environ.get('OPENAI_API_KEY'):
                raise RuntimeError('Set OPENAI_API_KEY in rag/.env')
            self.client = OpenAI(timeout=120, max_retries=0)      # retries handled in complete_json
        else:
            from google import genai
            key = os.environ.get('GEMINI_API_KEY')
            if not key:
                raise RuntimeError('Set GEMINI_API_KEY in rag/.env')
            self.client = genai.Client(api_key=key)

    def _call(self, prompt, model, temperature):
        if self.provider == 'openai':
            # gpt-6 models are reasoning models: temperature is fixed at 1, so it is not sent
            r = self.client.chat.completions.create(
                model=model, reasoning_effort=self.reasoning_effort, response_format={'type': 'json_object'},
                messages=[{'role': 'user', 'content': prompt}])
            return r.choices[0].message.content
        from google.genai import types
        cfg = types.GenerateContentConfig(temperature=temperature, response_mime_type='application/json')
        return self.client.models.generate_content(model=model, contents=prompt, config=cfg).text

    def complete_json(self, prompt, model=None, temperature=0.0):
        """Deterministic (temperature 0) JSON completion -> dict."""
        for attempt in range(8):                       # transient: disconnects, 429 rate limit, 5xx (~4 min)
            try:
                return parse_json(self._call(prompt, model or self.model, temperature))
            except Exception as e:                     # noqa: BLE001 - re-raised below if not transient
                code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
                if 'insufficient_quota' in str(e):
                    raise                              # billing problem: retrying won't help
                transient = code in TRANSIENT_CODES or type(e).__name__ in TRANSIENT_ERRORS
                if not transient or attempt == 7:
                    raise
                time.sleep(min(60, 2 ** attempt + 1))


def parse_json(text):
    text = (text or '').strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', text, re.S)
        return json.loads(m.group(0)) if m else {}
