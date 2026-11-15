import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# The mage's cape mantle was a wide lathe at chest height: from the front it
# read as a flat slab cutting across the jaw. Replace it with a shoulder cape
# that sits on the back and shoulders, never above the collarbone.
old = """      // cape mantle across the back
      const mantle = latheGeo([
        [0.04, 0], [0.20, 0.02], [0.235, 0.10], [0.245, 0.21], [0.2, 0.30],
      ], 16);
      const mantleMesh = add(this.chest, mantle, this.mats.coat2, 0, 0.20 * s, -0.03);
      mantleMesh.scale.set(1.15, 1, 0.72);
      mantleMesh.rotation.x = -0.06;"""
new = """      // shoulder cape: a half-cone that wraps the back and drapes over the
      // shoulder caps, open at the front so the chest and face stay clear
      const capeGeo = new THREE.CylinderGeometry(0.052 * s, 0.182 * s, 0.26 * s, 18, 1, true,
        Math.PI * 0.30, Math.PI * 1.40);
      const cape = new THREE.Mesh(capeGeo, this.mats.coat2);
      cape.position.set(0, 0.256 * s, -0.010 * s);
      cape.scale.set(1.0, 1.0, 0.86);
      cape.material.side = THREE.DoubleSide;
      cape.castShadow = true;
      this.chest.add(cape);
      // rolled hem along the bottom of the cape
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.176 * s, 0.008 * s, 5, 22, Math.PI * 1.36), this.mats.trim);
      hem.position.set(0, 0.128 * s, -0.010 * s);
      hem.rotation.set(Math.PI / 2, 0, Math.PI * 0.32);
      hem.scale.set(1.0, 0.86, 1);
      this.chest.add(hem);"""
assert old in src, "mantle block missing"
src = src.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("mantle replaced")
