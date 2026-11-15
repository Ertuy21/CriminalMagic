import io, sys
p = r"src/characters.js"
src = io.open(p, encoding="utf-8").read()

def fix_line(line):
    if not any('\u0400' <= ch <= '\u04FF' for ch in line):
        return line
    try:
        return line.encode("cp1251").decode("utf-8")
    except Exception:
        return line

fixed = "\n".join(fix_line(l) for l in src.split("\n"))
io.open(p, "w", encoding="utf-8", newline="\n").write(fixed)
print("has_rabotyaga", "работяга" in fixed)
print("has_patrol", "патруль" in fixed)
for i, l in enumerate(fixed.split("\n")[:130], 1):
    if i in (111, 116, 4):
        print(i, l.strip()[:120])
