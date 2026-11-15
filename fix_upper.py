import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# ---- torso: sloped trapezius instead of a bottle neck ---------------------
src = src.replace(
"""    const torso = latheGeo([
      [0.005, -0.08], [0.116, -0.07], [0.128, -0.01], [0.121, 0.07],
      [0.118, 0.14], [0.128, 0.21], [0.146, 0.29], [0.152, 0.340],
      [0.144, 0.380], [0.116, 0.408], [0.072, 0.424], [0.040, 0.432], [0.016, 0.435],
    ], 22);""",
"""    // Chest widest at the armpit line, then a long slope up to the neck:
    // that trapezius ramp is what stops shoulder caps reading as ball joints.
    const torso = latheGeo([
      [0.005, -0.08], [0.120, -0.07], [0.132, -0.01], [0.128, 0.07],
      [0.130, 0.14], [0.144, 0.21], [0.160, 0.27], [0.168, 0.312],
      [0.160, 0.345], [0.132, 0.374], [0.092, 0.398], [0.056, 0.414], [0.022, 0.421],
    ], 24);""")
src = src.replace("this.torso.scale.set(1.13, 1, 0.74);", "this.torso.scale.set(1.10, 1, 0.76);")

# ---- arms: start inside the shoulder slope, taper smoothly ---------------
src = src.replace(
"""      shoulder.position.set(sx * 0.184 * s, 0.352 * s, 0);
      this.chest.add(shoulder);
      const upper = add(shoulder, limbGeo(0.049 * s, 0.042 * s, 0.29 * s), this.mats.coat);""",
"""      shoulder.position.set(sx * 0.158 * s, 0.332 * s, 0);
      shoulder.rotation.z = sx * 0.14;
      this.chest.add(shoulder);
      const upper = add(shoulder, limbGeo(0.044 * s, 0.038 * s, 0.285 * s), this.mats.coat);""")

# remove the separate deltoid balls entirely: the torso slope covers them
src = src.replace(
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.064 * s, 16, 12), this.mats.coat);
      delt.position.set(sx * 0.184 * s, 0.348 * s, 0);
      delt.scale.set(1.0, 0.86, 0.95);
      delt.castShadow = true;
      this.chest.add(delt);
""", "")

# ---- mage lapels: narrow piping, not a black apron ----------------------
old_lap = """      // layered coat: open V, high collar, wide belt and rune brooch
      for (const sx of [-1, 1]) {
        const lapel = add(this.chest, new THREE.BoxGeometry(0.075 * s, 0.36 * s, 0.022), this.mats.coat2,
          sx * 0.052 * s, 0.245 * s, 0.108 * s);
        lapel.rotation.z = -sx * 0.16;
        lapel.rotation.x = -0.06;
        const under = add(this.chest, new THREE.BoxGeometry(0.055 * s, 0.34 * s, 0.014), this.mats.cloth,
          sx * 0.026 * s, 0.235 * s, 0.112 * s);
        under.rotation.z = -sx * 0.10;
        // chest strap
        const strap = add(this.chest, new THREE.BoxGeometry(0.038 * s, 0.30 * s, 0.015), this.mats.strap,
          sx * 0.115 * s, 0.26 * s, 0.098 * s);
        strap.rotation.z = sx * 0.42;
      }"""
new_lap = """      // Coat front: a V of trim that follows the chest, not a flat plate.
      for (const sx of [-1, 1]) {
        const edge = add(this.chest, new THREE.BoxGeometry(0.014 * s, 0.30 * s, 0.010), this.mats.trim,
          sx * 0.040 * s, 0.250 * s, 0.112 * s);
        edge.rotation.z = -sx * 0.14;
        edge.rotation.x = -0.05;
        const seam = add(this.chest, new THREE.BoxGeometry(0.006 * s, 0.28 * s, 0.006), this.mats.coat2,
          sx * 0.072 * s, 0.240 * s, 0.104 * s);
        seam.rotation.z = -sx * 0.10;
        // shoulder strap crossing the chest
        const strap = add(this.chest, new THREE.BoxGeometry(0.026 * s, 0.27 * s, 0.009), this.mats.strap,
          sx * 0.098 * s, 0.255 * s, 0.086 * s);
        strap.rotation.z = sx * 0.36;
      }"""
assert old_lap in src
src = src.replace(old_lap, new_lap)

# mage collar lapels: smaller
src = src.replace(
"""      // open lapels falling away from the collar
      for (const sx of [-1, 1]) {
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.048 * s, 0.13 * s, 0.016), this.mats.coat);
        lap.position.set(sx * 0.070 * s, 0.318 * s, 0.062 * s);
        lap.rotation.set(-0.10, 0, sx * 0.30);
        this.chest.add(lap);
      }""",
"""      // open lapels falling away from the collar
      for (const sx of [-1, 1]) {
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.036 * s, 0.105 * s, 0.012), this.mats.coat);
        lap.position.set(sx * 0.058 * s, 0.318 * s, 0.070 * s);
        lap.rotation.set(-0.10, 0, sx * 0.32);
        this.chest.add(lap);
      }""")

# ---- Lucia top: replace the box slab with a fitted shape ----------------
old_top = """      const top = add(this.chest, new THREE.BoxGeometry(0.22 * s, 0.28 * s, 0.16 * s), this.mats.dark, 0, 0.30 * s, 0.035);
      top.scale.z = 0.9;
      for (const sx of [-1, 1]) {
        const zip = add(this.chest, new THREE.BoxGeometry(0.012, 0.26 * s, 0.012), this.mats.silver,
          sx * 0.055 * s, 0.30 * s, 0.128 * s);
        const panel = add(this.chest, new THREE.BoxGeometry(0.032, 0.30 * s, 0.02), this.mats.coat,
          sx * 0.105 * s, 0.29 * s, 0.112 * s);
        panel.rotation.z = sx * 0.08;
        // neon piping
        const pip = add(this.chest, new THREE.BoxGeometry(0.008, 0.34 * s, 0.008), this.mats.trim,
          sx * 0.142 * s, 0.245 * s, 0.078 * s);
        pip.rotation.z = sx * 0.05;
      }"""
new_top = """      // Mesh top that follows the ribcage, plus an open leather vest.
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
assert old_top in src
src = src.replace(old_top, new_top)

# Lucia waist: keep hips and waist closer in width
src = src.replace(
"""    const belt = add(this.hips, new THREE.CylinderGeometry(0.128 * s, 0.132 * s, 0.058 * s, 18), this.mats.leather, 0, 0.012 * s, 0);
    belt.scale.z = 0.84;""",
"""    const belt = add(this.hips, new THREE.CylinderGeometry(0.118 * s, 0.122 * s, 0.052 * s, 20), this.mats.leather, 0, 0.008 * s, 0);
    belt.scale.z = 0.88;""")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("upper body rebuilt")
