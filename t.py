import io
p = "src/characters.js"
lines = io.open(p, encoding="utf-8").read().split("\n")
def rep(l):
    try:
        r = l.encode("cp1251").decode("utf-8")
        return r if any("\u0400" <= ch <= "\u04FF" for ch in r) else None
    except Exception:
        return None
for n in (495, 496, 497, 519, 520, 638):
    print(n, "->", rep(lines[n-1]))
