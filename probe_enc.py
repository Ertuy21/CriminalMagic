import io, collections
p = "src/characters.js"
src = io.open(p, encoding="utf-8").read()
bad = collections.Counter()
lines_bad = []
for i, l in enumerate(src.split("\n"), 1):
    if any('\u0400' <= ch <= '\u04FF' for ch in l):
        try:
            r = l.encode("cp1251").decode("utf-8")
            if any('\u0400' <= ch <= '\u04FF' for ch in r):
                # still cyrillic: could legitimately be correct russian
                pass
        except UnicodeEncodeError as e:
            lines_bad.append((i, str(e)[:80]))
        except UnicodeDecodeError as e:
            lines_bad.append((i, str(e)[:80]))
print("total lines", len(src.split("\n")))
print("undecodable", len(lines_bad))
for i, msg in lines_bad[:10]:
    print(i, msg)
