import io, re
p = "src/characters.js"
src = io.open(p, encoding="utf-8").read()
lines = src.split("\n")
# mojibake signature: cyrillic letters that only appear in cp1251-decoded utf8
sig = re.compile(r"[\u0420\u0421\u0402\u0403\u201a\u0459\u045a\u0452\u0409\u040a\u040f\u040e]")
bad = [i for i, l in enumerate(lines, 1) if "\u0400" <= max(l or " ", default=" ") <= "\u04FF" and sig.search(l)]
print(len(bad))
from itertools import groupby
runs = []
for k, g in groupby(enumerate(bad), lambda t: t[1]-t[0]):
    gg = [x[1] for x in g]
    runs.append((gg[0], gg[-1]))
print(runs)
