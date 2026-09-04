#!/usr/bin/env python3
"""Minimal, sanitized DeepSeek fallback API smoke test.

Required environment:
  DEEPSEEK_API_KEY

Optional environment:
  DEEPSEEK_BASE_URL   default: https://api.deepseek.com
  DEEPSEEK_MODEL      default: deepseek-v4-flash

The script deliberately prints no secret values and performs one tiny
non-streaming chat completion. It is intended only to qualify the fallback
coding route before Luna assigns DeepSeek implementation work.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def fail(reason: str, *, status: str | None = None) -> int:
    print("DEEPSEEK_SMOKE=FAIL")
    if status is not None:
        print(f"HTTP_STATUS={status}")
    print(f"REASON={reason}")
    return 1


def endpoint_from_base(base: str) -> str:
    value = base.rstrip("/")
    if value.endswith("/chat/completions"):
        return value
    return f"{value}/chat/completions"


def main() -> int:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return fail("DEEPSEEK_API_KEY_MISSING")

    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip()
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip()
    if not base_url.startswith("https://"):
        return fail("BASE_URL_MUST_USE_HTTPS")
    if not model:
        return fail("MODEL_MISSING")

    endpoint = endpoint_from_base(base_url)
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": "Reply exactly with: DEEPSEEK_OK"}
        ],
        "thinking": {"type": "disabled"},
        "max_tokens": 16,
        "stream": False,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "socialolla-deepseek-smoke/1.0",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        # Do not echo provider response bodies because they can contain request
        # fragments or account-specific diagnostic data.
        return fail(f"HTTP_ERROR_{exc.code}", status=str(exc.code))
    except urllib.error.URLError as exc:
        return fail(f"NETWORK_ERROR_{type(exc.reason).__name__}")
    except TimeoutError:
        return fail("TIMEOUT")

    if status != 200:
        return fail("UNEXPECTED_HTTP_STATUS", status=str(status))

    try:
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return fail("UNEXPECTED_RESPONSE_SHAPE", status=str(status))

    if content != "DEEPSEEK_OK":
        return fail("UNEXPECTED_COMPLETION_TEXT", status=str(status))

    usage = data.get("usage") if isinstance(data, dict) else None
    print("DEEPSEEK_SMOKE=PASS")
    print(f"HTTP_STATUS={status}")
    print(f"MODEL={model}")
    if isinstance(usage, dict):
        for source_key, output_key in (
            ("prompt_tokens", "INPUT_TOKENS"),
            ("completion_tokens", "OUTPUT_TOKENS"),
            ("total_tokens", "TOTAL_TOKENS"),
        ):
            value = usage.get(source_key)
            if isinstance(value, int):
                print(f"{output_key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
