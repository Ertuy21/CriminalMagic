import io
p = "src/characters.js"
lines = io.open(p, encoding="utf-8").read().split("\n")
l = lines[494]
print([hex(ord(c)) for c in l[:24]])
try:
    b = l.encode("cp1251")
    print("cp1251 ok", b)
    print(b.decode("utf-8"))
except Exception as e:
    print("ERR", e)
