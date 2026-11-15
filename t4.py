import io, re
p = "src/characters.js"
src = io.open(p, encoding="utf-8").read()
lines = src.split("\n")
for i, l in enumerate(lines, 1):
    if re.match(r"^const (BIRD|LAND|MARINE|REPTILE|INSECT)_SPECIES = \[", l) or l.strip() == "];" and i > 490 and i < 580:
        print(i, l[:40])
print("638:", lines[637][:160])
