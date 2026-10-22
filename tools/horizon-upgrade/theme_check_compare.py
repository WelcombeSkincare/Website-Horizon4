import collections
import json
import re
import sys

DIRS = ("assets", "blocks", "layout", "locales", "sections", "snippets", "templates", "config")


def rel(path):
    p = path.replace("\\", "/")
    for d in DIRS:
        i = p.find("/" + d + "/")
        if i >= 0:
            return p[i + 1:]
    return p


def load(path):
    text = open(path, encoding="utf-8-sig").read()
    text = text[text.find("["):]
    counts = collections.Counter()
    for f in json.loads(text):
        for o in f.get("offenses", []):
            sev = {0: "error", 1: "warning", 2: "info"}.get(o.get("severity"), str(o.get("severity")))
            counts[(sev, o["check"], rel(f["path"]))] += 1
    return counts


def tally(c):
    t = collections.Counter()
    for (sev, _, _), n in c.items():
        t[sev] += n
    return dict(t)


old, new = load(sys.argv[1]), load(sys.argv[2])
print("4.1.4:", tally(old))
print("4.3.0:", tally(new))
added, removed = new - old, old - new
print(f"\nNEW in 4.3.0 ({sum(added.values())}):")
for (sev, chk, path), n in sorted(added.items()):
    print(f"  {sev:7} {chk:34} {path} x{n}")
print(f"\nGONE in 4.3.0 ({sum(removed.values())}):")
for (sev, chk, path), n in sorted(removed.items()):
    print(f"  {sev:7} {chk:34} {path} x{n}")
