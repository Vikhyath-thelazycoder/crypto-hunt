"""T-809 `npm run bots`: every check, in order, against the TEST project only, into one run folder.

    lint · typecheck · build · unit tests · integration tests · e2e (player) · e2e (admin) · rule-checker tests ·
    bot simulation (25 crews, the projector and admin dashboard watched live) + rule check · attack suite ·
    load (30 crews) + rule check · security scans (npm audit, pip-audit, bundle secret scan, Supabase lint)

It never stops at the first failure: each step's result, log and timing go into docs/reports/runs/<date-time>/
(summary.md, summary.json, one log per step). The demo video is separate: `npm run demo`.

    scripts/sim/.venv/bin/python scripts/sim/run_all.py [--skip step,step] [--only step,step]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PY = sys.executable
sys.path.insert(0, str(HERE))

from lib import SERVICE, URL  # noqa: E402  (refuses production on import)


def sh(cmd: list[str] | str, log: Path, timeout: int = 1800, env: dict[str, str] | None = None) -> tuple[bool, str]:
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout, shell=isinstance(cmd, str),
                           env={**__import__("os").environ, **(env or {})})
        out, ok = p.stdout + p.stderr, p.returncode == 0
    except subprocess.TimeoutExpired as e:
        out, ok = f"{e.stdout or ''}{e.stderr or ''}\nTIMED OUT after {timeout}s", False
    log.write_text(out)
    return ok, f"{time.time() - t0:.0f}s"


def tail(text: str, pattern: str) -> str:
    hits = re.findall(pattern, text)
    return hits[-1] if hits else ""


def run(out: Path, skip: set[str], only: set[str]) -> list[dict[str, Any]]:
    steps: list[tuple[str, Callable[[Path], tuple[bool, str, str]]]] = []

    def npm(script: str, pattern: str, timeout: int = 1800) -> Callable[[Path], tuple[bool, str, str]]:
        def go(log: Path) -> tuple[bool, str, str]:
            ok, took = sh(["npm", "run", script], log, timeout)
            return ok, took, tail(log.read_text(), pattern)

        return go

    def pytest(target: str, name: str) -> Callable[[Path], tuple[bool, str, str]]:
        def go(log: Path) -> tuple[bool, str, str]:
            ok, took = sh([PY, "-m", "pytest", "-q", "-p", "no:cacheprovider", target, f"--junitxml={out / (name + '.xml')}"], log, 3600,
                          env={"PYTHONPATH": str(HERE)})
            return ok, took, tail(log.read_text(), r"\d+ (?:passed|failed)[^\n]*")

        return go

    def simulate(teams: int, seed: int, name: str) -> Callable[[Path], tuple[bool, str, str]]:
        def go(log: Path) -> tuple[bool, str, str]:
            folder = out / name
            watch = subprocess.Popen(["npx", "tsx", "--env-file=.env.local", "scripts/sim/watch.mts", str(folder)], cwd=ROOT,
                                     stdout=open(out / f"{name}-watch.log", "w"), stderr=subprocess.STDOUT)
            ok, took = sh([PY, str(HERE / "simulate.py"), "--teams", str(teams), "--seed", str(seed), "--out", str(folder)], log, 3600)
            watch.wait(timeout=300) if watch.poll() is None else None
            ok_o, _ = sh([PY, str(HERE / "oracle.py")], folder / "oracle.log", 600)
            (folder / "oracle.json").write_text((folder / "oracle.log").read_text())
            try:
                sim = json.loads((folder / "simulation.json").read_text())
                orc = json.loads((folder / "oracle.json").read_text())
            except (OSError, ValueError):
                return False, took, "no summary (the run crashed: see the log)"
            j = sim["join"]
            note = (f"{j['joined']}/{j['bots']} joined in {j['storm_seconds']}s ({j['first_try_refused']} refused at first); "
                    f"hunt {sim['hunt_minutes']} min; RPC p95 {sim['rpc']['p95_ms']} ms, 5xx {sim['rpc']['http_5xx']}; "
                    f"bot problems {len(sim['problems'])}; rule findings {len(orc['findings'])}")
            # A refused join is a flaw only when the server refused it (rate limit, full crew); a function that failed to
            # boot was retried once, as the Join screen does (F-04).
            refused = sum(n for code, n in j["refusals"].items() if code not in ("BOOT_ERROR", "SERVER") and not str(code).startswith("HTTP_5"))
            clean = ok and ok_o and not sim["problems"] and not orc["findings"] and j["joined"] == j["bots"] and refused == 0 and sim["rpc"]["http_5xx"] == 0
            return clean, took, note

        return go

    def scans(log: Path) -> tuple[bool, str, str]:
        t0 = time.time()
        lines, bad = [], 0
        ok, _ = sh(["npm", "audit", "--omit=dev", "--json"], out / "npm-audit.json", 300)
        try:
            v = json.loads((out / "npm-audit.json").read_text())["metadata"]["vulnerabilities"]
            serious = v.get("high", 0) + v.get("critical", 0)
            bad += serious
            lines.append(f"npm audit (runtime deps): {v}")
        except (ValueError, KeyError):
            lines.append("npm audit: could not read the report")
        ok, _ = sh([PY, "-m", "pip_audit", "-r", str(HERE / "requirements.txt"), "--progress-spinner", "off"], out / "pip-audit.log", 300)
        lines.append(f"pip-audit: {'no known vulnerabilities' if ok else 'see pip-audit.log'}")
        bad += 0 if ok else 1
        # The service-role key, or any secret key, must never be in what browsers download.
        # Actual key values only: the words "service_role" and the bare "sb_secret_" prefix appear in the app's own guard
        # that refuses secret keys (src/lib/env.ts), which is fine.
        env = __import__("lib").ENV
        secrets = [v for k, v in env.items() if k.endswith("SERVICE_ROLE_KEY") and len(v) > 20]
        leaks = []
        for f in (ROOT / ".next" / "static").rglob("*.js") if (ROOT / ".next" / "static").exists() else []:
            text = f.read_text(errors="ignore")
            if any(v in text for v in secrets) or re.search(r"sb_secret_[A-Za-z0-9_-]{16,}", text):
                leaks.append(str(f.relative_to(ROOT)))
        lines.append(f"bundle secret scan: {'clean' if not leaks else 'LEAK in ' + ', '.join(leaks[:5])}")
        bad += len(leaks)
        ok, _ = sh(["supabase", "db", "lint", "--linked", "--level", "warning"], out / "supabase-lint.log", 300)
        lint = (out / "supabase-lint.log").read_text()
        # apply_game_plan builds a temporary table (_pr) at run time, which a static lint can't see: not an issue.
        errs = []
        for line in lint.splitlines():
            if line.startswith('{"results"'):
                for res in json.loads(line)["results"]:
                    errs += [f"{res['function']}: {i['message']}" for i in res["issues"] if i["level"] == "error" and "_pr" not in i["message"]]
        lines.append(f"supabase db lint (test project): {'no errors (warnings in supabase-lint.log)' if not errs else 'ERRORS: ' + '; '.join(errs[:3])}")
        bad += len(errs)
        log.write_text("\n".join(lines))
        return bad == 0, f"{time.time() - t0:.0f}s", "; ".join(lines)

    steps += [
        ("lint", npm("lint", r"✖ [^\n]*|$")),
        ("typecheck", npm("typecheck", r"error TS\d+|$")),
        ("build", npm("build", r"First Load JS shared by all[^\n]*")),
        ("unit", npm("test", r"Tests\s+[^\n]*")),
        ("integration", npm("test:integration", r"Tests\s+[^\n]*", 2400)),
        ("e2e-player", npm("e2e", r"E2E PASSED|Error[^\n]*")),
        ("e2e-admin", npm("e2e:admin", r"ADMIN E2E PASSED|Error[^\n]*")),
        ("rule-checker-tests", pytest(str(HERE / "test_oracle.py"), "rule-checker-tests")),
        ("simulation", simulate(25, int(time.time()) % 1000, "simulation")),
        ("attacks", pytest(str(HERE / "attacks"), "attacks")),
        ("load", simulate(30, int(time.time()) % 1000 + 1, "load")),
        ("scans", scans),
    ]
    results = []
    for name, go in steps:
        if (only and name not in only) or name in skip:
            continue
        print(f"→ {name} …", flush=True)
        log = out / f"{name}.log"
        try:
            ok, took, note = go(log)
        except Exception as e:  # noqa: BLE001
            ok, took, note = False, "-", f"runner error: {e}"
        results.append({"step": name, "ok": ok, "took": took, "note": note, "log": log.name})
        print(f"  {'PASS' if ok else 'FAIL'} {took} {note}", flush=True)
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip", default="")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = ROOT / "docs" / "reports" / "runs" / datetime.now().strftime("%Y-%m-%d-%H%M")
    out.mkdir(parents=True, exist_ok=True)
    print(f"Bot run on {URL} → {out.relative_to(ROOT)}")
    results = run(out, set(filter(None, a.skip.split(","))), set(filter(None, a.only.split(","))))
    (out / "summary.json").write_text(json.dumps(results, indent=2))
    md = ["# Bot run " + out.name, "", f"Test project only. {sum(r['ok'] for r in results)} of {len(results)} steps passed.", "",
          "| Step | Result | Time | Notes | Log |", "|---|---|---|---|---|"]
    md += [f"| {r['step']} | {'✅ pass' if r['ok'] else '❌ FAIL'} | {r['took']} | {r['note']} | [{r['log']}]({r['log']}) |" for r in results]
    md += ["", "Findings are written up, fixed and retested in [docs/reports/flaws.md](../../flaws.md)."]
    (out / "summary.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
