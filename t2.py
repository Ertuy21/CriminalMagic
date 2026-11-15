import io
p = "src/characters.js"
lines = io.open(p, encoding="utf-8").read().split("\n")
def rep(l):
    for enc in ("cp1251","latin1","cp1252"):
        try:
            r = l.encode(enc).decode("utf-8")
            if any("\u0400" <= ch <= "\u04FF" for ch in r):
                return enc + " :: " + r
        except Exception:
            pass
    return None
src = io.open(p, encoding="utf-8").read()
fixed_lines = 0
out = []
for l in lines:
    r = rep(l)
    if r:
        out.append(r.split(" :: ",1)[1]); fixed_lines += 1
    else:
        out.append(l)
print("fixable", fixed_lines)
for n in (495, 496, 497, 519, 638):
    print(n, "->", rep(lines[n-1]))
