import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# ---------------- Lucia: feminine torso + a real open vest ---------------
old = """      // Mesh top that follows the ribcage, plus an open leather vest.
      for (const sx of [-1, 1]) {
        const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.078 * s, 0.092 * s, 0.30 * s, 12, 1, true,
          sx > 0 ? 0 : Math.PI, Math.PI * 0.62), this.mats.coat);
        vest.position.set(0, 0.262 * s, 0.006 * s);
        vest.scale.set(1.42, 1, 0.92);
        vest.material.side = THREE.DoubleSide;
        this.chest.add(vest);
        // neon piping along the vest edge
        const pip = new THREE.Mesh(new THREE.TorusGeometry(0.104 * s, 0.0035 * s, 4, 20, Math.PI * 0.60), this.mats.trim);
        pip.position.set(0, 0.250 * s, 0.020 * s);
        pip.scale.set(1.0, 2.4, 1.0);
        pip.rotation.set(Math.PI / 2, sx > 0 ? 0 : Math.PI, 0);
        this.chest.add(pip);
        // zip pull
        const pull = add(this.chest, new THREE.BoxGeometry(0.007, 0.028, 0.007), this.mats.silver,
          sx * 0.026 * s, 0.196 * s, 0.098 * s);
      }
      // collar buckle line across the chest
      add(this.chest, new THREE.BoxGeometry(0.070 * s, 0.008, 0.008), this.mats.trim, 0, 0.150 * s, 0.098 * s);"""

new = """      // Mesh top over a shaped chest, with a leather vest hanging open.
      // The vest is two curved panels hinged at the shoulders, so it follows
      // the ribcage instead of reading as a flat slab.
      const chestShape = new THREE.Mesh(new THREE.SphereGeometry(0.098 * s, 16, 12), this.mats.dark);
      chestShape.position.set(0, 0.256 * s, 0.012 * s);
      chestShape.scale.set(1.12, 1.24, 0.94);
      this.chest.add(chestShape);
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.CylinderGeometry(0.104 * s, 0.090 * s, 0.30 * s, 14, 1, true,
          sx > 0 ? -0.34 : Math.PI - 0.34, 0.68), this.mats.coat);
        panel.position.set(sx * 0.006 * s, 0.258 * s, 0.014 * s);
        panel.scale.set(1.18, 1, 0.98);
        panel.material.side = THREE.DoubleSide;
        panel.castShadow = true;
        this.chest.add(panel);
        // neon piping running down the open edge of the vest
        const pip = new THREE.Mesh(new THREE.BoxGeometry(0.006 * s, 0.30 * s, 0.007), this.mats.trim);
        pip.position.set(sx * 0.036 * s, 0.256 * s, 0.102 * s);
        pip.rotation.z = sx * 0.05;
        this.chest.add(pip);
        // shoulder seam
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.062 * s, 0.010, 0.010), this.mats.trim);
        seam.position.set(sx * 0.086 * s, 0.376 * s, 0.028 * s);
        seam.rotation.z = sx * -0.30;
        this.chest.add(seam);
      }
      // laced front: three small buckles down the centre
      for (let k = 0; k < 3; k++) {
        const y = 0.300 * s - k * 0.048 * s;
        add(this.chest, new THREE.BoxGeometry(0.030 * s, 0.005 * s, 0.006), this.mats.silver, 0, y, 0.100 * s);
      }"""
assert old in src
src = src.replace(old, new)

# Lucia: narrower pelvis, defined waist
src = src.replace(
"""    const pelvisMesh = add(this.hips, pelvis, mage ? this.mats.cloth : this.mats.coat2);
    pelvisMesh.scale.set(1.08, 1, 0.86);""",
"""    const pelvisMesh = add(this.hips, pelvis, mage ? this.mats.cloth : this.mats.coat2);
    pelvisMesh.scale.set(mage ? 1.08 : 1.02, 1, mage ? 0.86 : 0.80);""")

# Lucia: hips flare from the waist instead of a bulge
src = src.replace(
"""    const belt = add(this.hips, new THREE.CylinderGeometry(0.118 * s, 0.122 * s, 0.052 * s, 20), this.mats.leather, 0, 0.008 * s, 0);
    belt.scale.z = 0.88;""",
"""    const belt = add(this.hips, new THREE.CylinderGeometry(0.110 * s, 0.116 * s, 0.046 * s, 20), this.mats.leather, 0, 0.008 * s, 0);
    belt.scale.z = 0.90;
    const hipBand = add(this.hips, new THREE.CylinderGeometry(0.122 * s, 0.114 * s, 0.085 * s, 20), mage ? this.mats.cloth : this.mats.coat2, 0, -0.048 * s, 0);
    hipBand.scale.z = 0.84;""")

# Lucia trousers: straight leg without the knee pinch
src = src.replace(
"""      add(hip, limbGeo(0.078 * s, 0.060 * s, 0.42 * s), pants);""",
"""      add(hip, limbGeo(mage ? 0.072 * s : 0.066 * s, 0.055 * s, 0.42 * s), pants);""")
src = src.replace(
"""      add(knee, limbGeo(0.058 * s, 0.042 * s, 0.41 * s), pants);""",
"""      add(knee, limbGeo(0.054 * s, 0.040 * s, 0.41 * s), pants);""")

# arms hang slightly away from the ribs
src = src.replace("shoulder.rotation.z = sx * 0.14;", "shoulder.rotation.z = sx * 0.20;")

# mage: trim the apron straps so the chest reads as cloth
src = src.replace(
"""        // shoulder strap crossing the chest
        const strap = add(this.chest, new THREE.BoxGeometry(0.026 * s, 0.27 * s, 0.009), this.mats.strap,
          sx * 0.098 * s, 0.255 * s, 0.086 * s);
        strap.rotation.z = sx * 0.36;""",
"""        // single shoulder strap crossing the chest
        if (sx > 0) {
          const strap = add(this.chest, new THREE.BoxGeometry(0.024 * s, 0.30 * s, 0.008), this.mats.strap,
            0.052 * s, 0.258 * s, 0.092 * s);
          strap.rotation.z = 0.30;
          const buckle = add(this.chest, new THREE.BoxGeometry(0.020, 0.016, 0.010), this.mats.gold,
            0.024 * s, 0.196 * s, 0.098 * s);
        }""")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("lucia rebuilt")
