"""Compare two runs of tests/storefront-regression.js.

    python tests/compare.py tests/baselines/OLD.json NEW.json

Prints every check whose pass/fail state changed, every information-only value
that changed, and checks present in one run but not the other. Exits 1 if any
check that passed in OLD fails in NEW, so a regression can't scroll past.
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        run = json.load(f)
    return run["meta"], {r["id"]: r for r in run["results"]}


def main(old_path, new_path):
    old_meta, old = load(old_path)
    new_meta, new = load(new_path)
    for label, meta in (("OLD", old_meta), ("NEW", new_meta)):
        t = meta.get("served") or {}
        print(f"{label}: {t.get('name')} #{t.get('id')} {t.get('schema')} {t.get('version')} "
              f"({t.get('role')}) at {meta.get('started')}" + ("  [PARTIAL]" if meta.get("partial") else ""))
    print()

    regressions, fixes, changed = [], [], []
    for cid in sorted(set(old) | set(new)):
        a, b = old.get(cid), new.get(cid)
        if a is None or b is None:
            changed.append(f"  {'ADDED  ' if a is None else 'REMOVED'} {cid}")
            continue
        if a["ok"] is True and b["ok"] is False:
            regressions.append(f"  {cid}\n      was: {a['value']}\n      now: {b['value']}")
        elif a["ok"] is False and b["ok"] is True:
            fixes.append(f"  {cid}: {b['value']}")
        elif a["value"] != b["value"]:
            changed.append(f"  {cid}\n      was: {a['value']}\n      now: {b['value']}")

    print(f"REGRESSIONS ({len(regressions)})")
    print("\n".join(regressions) or "  none")
    print(f"\nNEWLY PASSING ({len(fixes)})")
    print("\n".join(fixes) or "  none")
    print(f"\nVALUES CHANGED, SAME RESULT ({len(changed)})")
    print("\n".join(changed) or "  none")
    return 1 if regressions else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
