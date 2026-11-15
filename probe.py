import io, re
p = "src/characters.js"
src = io.open(p, encoding="utf-8").read()
# find mojibake: sequences of cyrillic chars typical of double-encoded utf8
bad = []
for i, l in enumerate(src.split("\n"), 1):
    if "Р" in l and re.search(r"[РС][\u0400-\u04FF\u2018-\u203a]", l):
        bad.append((i, l.strip()[:90]))
print(len(bad))
for b in bad[:20]:
    print(b[0], b[1])
