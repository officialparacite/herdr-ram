#!/usr/bin/env python3
"""Mutation runs for tests/verify.mjs: each mutation is applied to a fresh copy
of the files (never the originals), then the tests run against the copy with
RAM_HOME. A mutation that the tests don't notice ("SURVIVED") is a check missing.

    python3 tests/mutate.py muts.json             mutate this package's files
    RAM_SRC=~/.config/herdr-app python3 tests/mutate.py muts.json

muts.json is a list of [name, path, old, new]: in the copy of PATH, OLD (which
must occur exactly once) becomes NEW.
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.expanduser(os.environ.get("RAM_SRC", os.path.dirname(HERE)))
COPY = "/tmp/ram-mut"
PARTS = ["keys.json", ".gitignore", "RECIPE.md", "layouts", "themes", "mods/ram", "mods/prefix", "mods/text-bigger",
         "mods/text-smaller", "mods/ram-prefix", "mods/ram-text-bigger", "mods/ram-text-smaller",
         "mods/night-city", "mods/traveler-spaces"]


def fresh():
    shutil.rmtree(COPY, ignore_errors=True)
    os.makedirs(COPY + "/mods")
    for p in PARTS:
        src, dst = f"{SRC}/{p}", f"{COPY}/{p}"
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        elif os.path.isfile(src):
            shutil.copy2(src, dst)


def run(muts):
    results = []
    for name, path, old, new in muts:
        fresh()
        f = f"{COPY}/{path}"
        if not os.path.isfile(f):
            results.append((name, f"NO FILE {path} in {SRC}", ""))
            continue
        text = open(f).read()
        n = text.count(old)
        if n != 1:
            results.append((name, f"BAD MUTATION (found {n}x)", ""))
            continue
        open(f, "w").write(text.replace(old, new))
        r = subprocess.run(["node", os.path.join(HERE, "verify.mjs")], env={**os.environ, "RAM_HOME": COPY},
                           capture_output=True, text=True, timeout=600)
        out = r.stdout + r.stderr
        msg = next((l.strip() for l in out.splitlines() if "AssertionError" in l or "Error:" in l), "")
        results.append((name, "killed" if r.returncode != 0 else "SURVIVED", msg[:150]))
    shutil.rmtree(COPY, ignore_errors=True)
    for r in results:
        print(" | ".join(r))
    return all(r[1] == "killed" for r in results)


if __name__ == "__main__":
    sys.exit(0 if run(json.load(open(sys.argv[1]))) else 1)
