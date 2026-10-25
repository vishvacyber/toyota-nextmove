"""Guardian (CLAUDE.md rule 2): deterministic checks on every agent output before it reaches a customer.

Every number in the text must exist in that run's tool output. block = never show; revise = send back once.
"""

import re
from dataclasses import dataclass

from app.models import Check, GuardianVerdict, Name, Verdict

DISCLOSURE = "Estimates only, not a credit decision."
DISCLOSURES = {"en": DISCLOSURE, "es": "Solo estimaciones, no es una decisión de crédito."}
SMALL_COUNTS = set(range(11))   # "2 options", "3 months": counting words, not money

NUM = re.compile(r"(?<![\w.])\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|k\b)?", re.IGNORECASE)
PROTECTED = re.compile(r"\b(race|racial|ethnicity|religio\w*|national origin|gender|sex|sexual orientation|"
                       r"pregnan\w*|disabilit\w*|marital status|your age|too old|too young)\b", re.IGNORECASE)
TONE = re.compile(r"\b(guarantee\w*|risk[- ]free|no[- ]brainer|you must|act now or|definitely|can't lose|garantizad\w*|sin riesgo|tienes que|debes actuar)\b", re.IGNORECASE)
CONSENT = re.compile(r"\b(i(?:'ve| have)? (?:booked|scheduled|approved|deferred|submitted|sent)|"
                     r"(?:is|has been|was) (?:booked|scheduled|approved|deferred)|deferral is approved|he (?:reservado|programado|agendado|aprobado|diferido|enviado)|(?:está|fue|ha sido) (?:aprobad|reservad|programad|diferid)\w*)\b", re.IGNORECASE)
INJECTION = re.compile(r"(ignore (?:all |any |the )?(?:previous|prior|above) (?:instructions|rules)|system prompt|"
                       r"developer mode|you are now|jailbreak|disregard (?:your|the) (?:rules|instructions)|"
                       r"reveal (?:your|the) (?:prompt|instructions)|act as (?:an? )?(?:admin|developer)|"
                       r"approve (?:my|the) (?:loan|credit|deferral) now)", re.IGNORECASE)
ORDINAL_AFTER = re.compile(r"(?:st|nd|rd|th)\b", re.IGNORECASE)
ORDINAL_BEFORE = re.compile(r"\b(?:el|d[ií]a)\s+$", re.IGNORECASE)
LEAK = re.compile(r"(mcp__nextmove__|system prompt|my instructions say)", re.IGNORECASE)


@dataclass(frozen=True)
class Match:
    value: float
    label: str
    source_tool: str


def scan(text: str) -> list[tuple[float, bool, bool]]:
    """(value, is_percent, is_ordinal) for every number in text. $1,234.50 → 1234.5; 5.9% → 5.9; $28k → 28000;
    "the 17th" / "el 17" / "día 17" → 17, ordinal (a day of the month)."""
    out = []
    for m in NUM.finditer(text):
        v = float(m.group(1).replace(",", "") + (f".{m.group(2)}" if m.group(2) else ""))
        unit = (m.group(3) or "").lower()
        ordinal = bool(ORDINAL_AFTER.match(text, m.end()) or ORDINAL_BEFORE.search(text[:m.start()]))
        out.append((v * 1000 if unit == "k" else v, unit == "%", ordinal and not unit and not m.group(2)))
    return out


def numbers(text: str) -> list[tuple[float, bool]]:
    return [(v, pct) for v, pct, _ in scan(text)]


def tool_numbers(tool_outputs: list[tuple[str, object]]) -> list[tuple[float, str, str, bool, bool]]:
    """(value, label, tool, is_field, is_day) for every numeric field and every number written inside a string of each
    tool output. A field is labelled by its name ("monthly_payment" → "Monthly payment"), a string by itself.
    is_day: a day-of-month field (due_day) or an ordinal in a string ("the 17th")."""
    out: list[tuple[float, str, str, bool, bool]] = []

    def walk(x: object, key: str, tool: str) -> None:
        if isinstance(x, bool):
            return
        if isinstance(x, int | float):
            out.append((float(x), key.replace("_", " ").capitalize(), tool, True, key.endswith("day")))
        elif isinstance(x, str):
            out.extend((v, x[:100], tool, False, ordinal) for v, _, ordinal in scan(x))
        elif isinstance(x, dict):
            for k, v in x.items():
                walk(v, k, tool)
        elif isinstance(x, list):
            for v in x:
                walk(v, key, tool)

    for tool, output in tool_outputs:
        walk(output, tool, tool)
    return out


def _tier(v: float, t: float, pct: bool) -> int | None:
    """0 exact, 1 rounded to the dollar, 2 rounded to 10/100/1,000 within 1% ("about $28,900"); None if no match."""
    tiers = []
    for c in ([abs(t), abs(t) * 100] if pct else [abs(t)]):
        if abs(v - c) <= 0.005:
            tiers.append(0)
        elif abs(v - c) <= 0.51:
            tiers.append(1)
        elif v >= 100 and abs(v - c) <= 0.01 * c and any(v == round(c, -k) for k in (1, 2, 3)):
            tiers.append(2)
    return min(tiers, default=None)


def _pref(ordinal: bool, field: bool, day: bool) -> int:
    """A named field beats a number inside a sentence. An ordinal ("the 17th") is a day of the month: a *_day field,
    then an ordinal in a sentence, then any sentence, never an unrelated field that happens to share the value."""
    if ordinal:
        return 0 if day and field else 1 if day else 2 if not field else 3
    return 0 if field else 1


def _check(name: Name, ok: bool, detail: str | None = None) -> Check:
    return Check(name=name, passed=ok, detail=None if ok else detail)


def check(text: str, tool_outputs: list[tuple[str, object]], user_message: str = "") -> tuple[GuardianVerdict, list[Match]]:
    known = tool_numbers(tool_outputs)
    allowed = {v for v, _ in numbers(user_message)} | SMALL_COUNTS
    matches, unmatched = [], []
    for v, pct, ordinal in scan(text):
        # best match: closest tier, then the preferred kind of source, then tool order
        ranked = [(tier, _pref(ordinal, field, day), i) for i, (t, _, _, field, day) in enumerate(known)
                  if (tier := _tier(v, t, pct)) is not None]
        if ranked:
            _, label, tool, _, _ = known[min(ranked)[2]]
            if pct or v not in SMALL_COUNTS:   # "$0 down" or "6 months" would only add noise to numbers_used
                matches.append(Match(v, label, tool))
        elif v not in allowed:
            unmatched.append(f"{v:g}{'%' if pct else ''}")
    checks = [
        _check(Name.numbers_match_tools, not unmatched, f"Not in tool output: {', '.join(unmatched)}"),
        _check(Name.fairness, not PROTECTED.search(text), "Mentions a protected attribute"),
        _check(Name.tone, not TONE.search(text), "Pressure or over-promising language"),
        _check(Name.consent, not CONSENT.search(text), "Claims an action that needs consent or a human"),
        _check(Name.disclosures, any(d in text for d in DISCLOSURES.values()), "Missing estimate disclosure"),
        _check(Name.prompt_injection, not INJECTION.search(user_message) and not LEAK.search(text),
               "Prompt injection in the request or instructions leaked in the answer"),
    ]
    failed = {c.name for c in checks if not c.passed}
    if failed & {Name.numbers_match_tools, Name.fairness, Name.prompt_injection}:
        verdict = Verdict.block
    elif failed:
        verdict = Verdict.revise
    else:
        verdict = Verdict.pass_
    # one entry per distinct number + source, so numbers_used isn't padded with repeats ("17th" and "17 months" both stay)
    return GuardianVerdict(verdict=verdict, checks=checks), list(dict.fromkeys(matches))


def injected(user_message: str) -> bool:
    return bool(INJECTION.search(user_message))
