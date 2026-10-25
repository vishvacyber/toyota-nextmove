"""Provider chain for every agent call: Gemini first, the Claude Agent SDK as backup.

Both return the same `sdk.Run` (text + every tool call), and the caller still runs the Guardian on it, so the
provider never changes what reaches a customer. Only when both fail does the caller raise `sdk.Busy` (503, retry).
"""

import logging

from agents import gemini, sdk

log = logging.getLogger("nextmove.llm")


async def run(system: str, prompt: str | list[dict], names: list[str], **kw) -> sdk.Run:
    """kw: timeout / max_turns, passed through unchanged to whichever provider answers."""
    if gemini.available():
        try:
            return await gemini.run(system, prompt, names, **{**kw, "timeout": min(kw.get("timeout", gemini.TIMEOUT_S), gemini.TIMEOUT_S)})
        except sdk.SdkUnavailable as e:
            log.warning("Gemini unavailable (%s); trying Claude", e)
    return await sdk.run(system, prompt, names, **kw)
