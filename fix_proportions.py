import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# --- 1. narrower skull so the face is not a balloon -------------------------
src = src.replace("cranium.scale.set(0.94, 1.05, 1.0);", "cranium.scale.set(0.86, 1.06, 1.02);")
src = src.replace("const jaw = add(this.head, jawGeo, this.mats.skin, 0, CRANIUM_Y - 0.006 * s, 0.006);\n    jaw.scale.set(0.99, 1.0, 0.94);",
                  "const jaw = add(this.head, jawGeo, this.mats.skin, 0, CRANIUM_Y - 0.006 * s, 0.006);\n    jaw.scale.set(0.90, 1.02, 0.96);")

# --- 2. brooch: chest badge instead of a neck-plate -------------------------
src = src.replace(
"""      const brooch = add(this.chest, new THREE.OctahedronGeometry(0.026 * s, 0), this.mats.rune, 0, 0.40 * s, 0.128 * s);
      brooch.rotation.z = Math.PI / 4;
      const broochRing = new THREE.Mesh(new THREE.TorusGeometry(0.034 * s, 0.006 * s, 5, 14), this.mats.gold);
      broochRing.position.set(0, 0.40 * s, 0.128 * s);
      this.chest.add(broochRing);
      this.brooch = brooch;""",
"""      const brooch = add(this.chest, new THREE.OctahedronGeometry(0.016 * s, 0), this.mats.rune, 0, 0.300 * s, 0.108 * s);
      brooch.rotation.z = Math.PI / 4;
      const broochRing = new THREE.Mesh(new THREE.TorusGeometry(0.022 * s, 0.0038 * s, 5, 14), this.mats.gold);
      broochRing.position.set(0, 0.300 * s, 0.108 * s);
      broochRing.scale.z = 0.7;
      this.chest.add(broochRing);
      this.brooch = brooch;""")

# --- 3. staff: thinner, tucked against the back ----------------------------
src = src.replace(
"""      const staff = new THREE.Group();
      staff.position.set(0.17 * s, 0.10 * s, -0.135 * s);
      staff.rotation.set(0.14, 0, -0.22);""",
"""      const staff = new THREE.Group();
      staff.position.set(0.115 * s, 0.06 * s, -0.098 * s);
      staff.rotation.set(0.10, 0, -0.14);""")
src = src.replace("const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017 * s, 0.023 * s, 1.62 * s, 8), this.mats.leather);",
                  "const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * s, 0.015 * s, 1.5 * s, 8), this.mats.leather);")
src = src.replace("shaft.position.y = 0.16 * s;", "shaft.position.y = 0.10 * s;")
src = src.replace("const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * s, 0.024 * s, 0.28 * s, 8), this.mats.strap);",
                  "const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.016 * s, 0.26 * s, 8), this.mats.strap);")
src = src.replace("const head = new THREE.Mesh(new THREE.TorusGeometry(0.072 * s, 0.011 * s, 6, 16), this.mats.gold);\n      head.position.y = 0.98 * s;",
                  "const head = new THREE.Mesh(new THREE.TorusGeometry(0.048 * s, 0.008 * s, 6, 16), this.mats.gold);\n      head.position.y = 0.88 * s;")
src = src.replace("const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.055 * s, 0), this.mats.rune);\n      crystal.position.y = 0.98 * s;",
                  "const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.037 * s, 0), this.mats.rune);\n      crystal.position.y = 0.88 * s;")
src = src.replace("this.staffCrystal.position.y = 0.98 * s + Math.sin(this.time * 2) * 0.006;",
                  "this.staffCrystal.position.y = 0.88 * s + Math.sin(this.time * 2) * 0.006;")

# --- 4. shoulder caps: flatter, wider, less like balloons ------------------
src = src.replace(
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.077 * s, 14, 10), this.mats.coat);
      delt.position.set(sx * 0.200 * s, 0.372 * s, 0);
      delt.scale.set(1, 0.92, 1.05);""",
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.070 * s, 16, 12), this.mats.coat);
      delt.position.set(sx * 0.196 * s, 0.360 * s, 0);
      delt.scale.set(1.05, 0.80, 1.0);""")
src = src.replace(
"""        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.083 * s, 12, 7, 0, TAU, 0, Math.PI * 0.5), this.mats.coat2);
        pad.position.set(sx * 0.200 * s, 0.388 * s, 0);
        pad.scale.set(1.12, 0.7, 1.12);""",
"""        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 14, 8, 0, TAU, 0, Math.PI * 0.52), this.mats.coat2);
        pad.position.set(sx * 0.196 * s, 0.374 * s, 0);
        pad.scale.set(1.14, 0.62, 1.10);""")
src = src.replace(
"""        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.079 * s, 0.0055 * s, 5, 16, Math.PI), this.mats.trim);
        rim.position.set(sx * 0.200 * s, 0.372 * s, 0);
        rim.rotation.x = Math.PI / 2;""",
"""        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.073 * s, 0.0048 * s, 5, 18, Math.PI), this.mats.trim);
        rim.position.set(sx * 0.196 * s, 0.358 * s, 0);
        rim.rotation.x = Math.PI / 2;""")

# --- 5. coat tails: hang down close to the legs, narrower ------------------
old_tails = """    const tailDefs = mage
      ? [[-0.075, 0.35, -0.02, 0.30], [0.075, 0.35, -0.02, 0.30], [0, 0.42, -0.115, 0.34], [0, 0.34, 0.115, 0.28]]
      : [[-0.07, 0.20, -0.06, 0.18], [0.07, 0.20, -0.06, 0.18]];
    for (let i = 0; i < tailDefs.length; i++) {
      const [xoff, len, zoff, width] = tailDefs[i];
      const root = new THREE.Group();
      root.position.set(xoff * s, -0.01, zoff * s);
      root.rotation.y = xoff === 0 && zoff > 0 ? Math.PI : 0;
      this.hips.add(root);
      let parent = root;
      const segs = [];
      const segLen = len / 2;
      for (let k = 0; k < 2; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : -segLen * s;
        parent.add(seg);
        const w = (width * (1 - k * 0.18)) * s;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w, segLen * s, 0.022 * s), mage ? this.mats.coat : this.mats.coat);
        panel.position.y = -segLen * s / 2;
        panel.castShadow = true;
        seg.add(panel);
        // inner lining and trim edge
        add(seg, new THREE.BoxGeometry(w * 0.94, segLen * s * 0.96, 0.004), this.mats.coat2, 0, -segLen * s / 2, -0.012 * s);
        add(seg, new THREE.BoxGeometry(0.012 * s, segLen * s, 0.026 * s), this.mats.trim, w / 2, -segLen * s / 2, 0);
        segs.push(seg);
        parent = seg;
      }
      this.tails.push({ root, segs });
    }"""
new_tails = """    // A skirt of narrow panels that hangs down the back and sides, plus two
    // front flaps. Panels curve with the hips instead of sticking out.
    const tailDefs = mage
      ? [
        [-0.118, 0.44, -0.030, 0.115, -0.20],
        [0.118, 0.44, -0.030, 0.115, 0.20],
        [0.000, 0.50, -0.105, 0.150, 0.00],
        [-0.086, 0.30, 0.075, 0.100, -0.30],
        [0.086, 0.30, 0.075, 0.100, 0.30],
      ]
      : [
        [-0.100, 0.24, -0.060, 0.105, -0.18],
        [0.100, 0.24, -0.060, 0.105, 0.18],
      ];
    for (let i = 0; i < tailDefs.length; i++) {
      const [xoff, len, zoff, width, tilt] = tailDefs[i];
      const root = new THREE.Group();
      root.position.set(xoff * s, -0.005, zoff * s);
      root.rotation.z = tilt * 0.35;
      this.hips.add(root);
      let parent = root;
      const segs = [];
      const segLen = len / 2;
      for (let k = 0; k < 2; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : -segLen * s;
        parent.add(seg);
        const w = (width * (1 - k * 0.14)) * s;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w, segLen * s, 0.016 * s), this.mats.coat);
        panel.position.y = -segLen * s / 2;
        panel.castShadow = true;
        seg.add(panel);
        // inner lining
        add(seg, new THREE.BoxGeometry(w * 0.9, segLen * s * 0.96, 0.003), this.mats.coat2, 0, -segLen * s / 2, -0.009 * s);
        // trim only along the outer edge
        add(seg, new THREE.BoxGeometry(0.007 * s, segLen * s, 0.019 * s), this.mats.trim, w / 2, -segLen * s / 2, 0);
        segs.push(seg);
        parent = seg;
      }
      this.tails.push({ root, segs });
    }"""
assert old_tails in src, "tails block missing"
src = src.replace(old_tails, new_tails)

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("proportions fixed")
