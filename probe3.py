import io
p = "src/characters.js"
lines = io.open(p, encoding="utf-8").read().split("\n")
for n in [496,498,501,502,503,509,511,514,515,520,522,524,527,528,529,530,535,536,538,541,542,546,558,563,564,565,638]:
    print(n, lines[n-1][:200])
