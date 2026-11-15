import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# --- pelvis: smaller, flatter, no bulge ------------------------------------
src = src.replace(
"""    const pelvis = latheGeo([
      [0.001, -0.13], [0.09, -0.12], [0.125, -0.075], [0.138, -0.02],
      [0.135, 0.03], [0.122, 0.075], [0.001, 0.09],
    ], 16);
    const pelvisMesh = add(this.hips, pelvis, mage ? this.mats.cloth : this.mats.coat2);
    pelvisMesh.scale.set(1.14, 1, 0.82);""",
"""    const pelvis = latheGeo([
      [0.001, -0.115], [0.082, -0.108], [0.112, -0.070], [0.124, -0.020],
      [0.122, 0.028], [0.112, 0.068], [0.001, 0.082],
    ], 18);
    const pelvisMesh = add(this.hips, pelvis, mage ? this.mats.cloth : this.mats.coat2);
    pelvisMesh.scale.set(1.08, 1, 0.86);""")

# --- torso: fuller waist, less wasp pinch ---------------------------------
src = src.replace(
"""    const torso = latheGeo([
      [0.005, -0.08], [0.110, -0.07], [0.128, -0.01], [0.120, 0.07],
      [0.112, 0.14], [0.122, 0.21], [0.144, 0.29], [0.156, 0.345],
      [0.148, 0.385], [0.118, 0.412], [0.072, 0.428], [0.040, 0.436], [0.016, 0.439],
    ], 22);""",
"""    const torso = latheGeo([
      [0.005, -0.08], [0.116, -0.07], [0.128, -0.01], [0.121, 0.07],
      [0.118, 0.14], [0.128, 0.21], [0.146, 0.29], [0.152, 0.340],
      [0.144, 0.380], [0.116, 0.408], [0.072, 0.424], [0.040, 0.432], [0.016, 0.435],
    ], 22);""")

# --- shoulders: no armour balls, just a smooth deltoid --------------------
src = src.replace(
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.070 * s, 16, 12), this.mats.coat);
      delt.position.set(sx * 0.196 * s, 0.360 * s, 0);
      delt.scale.set(1.05, 0.80, 1.0);
      delt.castShadow = true;
      this.chest.add(delt);
      if (mage) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 14, 8, 0, TAU, 0, Math.PI * 0.52), this.mats.coat2);
        pad.position.set(sx * 0.196 * s, 0.374 * s, 0);
        pad.scale.set(1.14, 0.62, 1.10);
        this.chest.add(pad);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.073 * s, 0.0048 * s, 5, 18, Math.PI), this.mats.trim);
        rim.position.set(sx * 0.196 * s, 0.358 * s, 0);
        rim.rotation.x = Math.PI / 2;
        this.chest.add(rim);
      }
    }""",
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.064 * s, 16, 12), this.mats.coat);
      delt.position.set(sx * 0.184 * s, 0.348 * s, 0);
      delt.scale.set(1.0, 0.86, 0.95);
      delt.castShadow = true;
      this.chest.add(delt);
    }""")

# --- arms: slimmer, and Lucia's forearms are bare -------------------------
src = src.replace(
"""      shoulder.position.set(sx * 0.198 * s, 0.372 * s, 0);
      this.chest.add(shoulder);
      const sleeve = mage ? this.mats.coat : this.mats.coat;
      const upper = add(shoulder, limbGeo(0.055 * s, 0.047 * s, 0.30 * s), sleeve);""",
"""      shoulder.position.set(sx * 0.184 * s, 0.352 * s, 0);
      this.chest.add(shoulder);
      const upper = add(shoulder, limbGeo(0.049 * s, 0.042 * s, 0.29 * s), this.mats.coat);""")
src = src.replace(
"""      const foreMat = mage ? this.mats.coat : this.mats.skin;
      add(elbow, limbGeo(0.046 * s, 0.038 * s, 0.27 * s), foreMat);""",
"""      const foreMat = mage ? this.mats.coat : this.mats.skin;
      add(elbow, limbGeo(0.041 * s, 0.034 * s, 0.26 * s), foreMat);""")
src = src.replace("const elbow = new THREE.Group();\n      elbow.position.y = -0.30 * s;",
                  "const elbow = new THREE.Group();\n      elbow.position.y = -0.285 * s;")
src = src.replace("const hand = new THREE.Group();\n      hand.position.y = -0.27 * s;",
                  "const hand = new THREE.Group();\n      hand.position.y = -0.262 * s;")
src = src.replace("const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042 * s, 9, 7), mage ? this.mats.skin : this.mats.skin);",
                  "const palm = new THREE.Mesh(new THREE.SphereGeometry(0.036 * s, 9, 7), this.mats.skin);")
src = src.replace("const fingers = add(hand, new THREE.BoxGeometry(0.058 * s, 0.052 * s, 0.03 * s), mage ? this.mats.skin : this.mats.dark, 0, -0.042 * s, 0.006);",
                  "const fingers = add(hand, new THREE.BoxGeometry(0.050 * s, 0.046 * s, 0.028 * s), mage ? this.mats.skin : this.mats.dark, 0, -0.038 * s, 0.006);")
src = src.replace("add(hand, new THREE.BoxGeometry(0.018 * s, 0.036 * s, 0.02 * s), mage ? this.mats.skin : this.mats.dark, -sx * 0.034 * s, -0.014 * s, 0.012).rotation.z = sx * 0.5;",
                  "add(hand, new THREE.BoxGeometry(0.016 * s, 0.032 * s, 0.018 * s), mage ? this.mats.skin : this.mats.dark, -sx * 0.030 * s, -0.012 * s, 0.010).rotation.z = sx * 0.5;")

# --- Lucia: shorter nape hair, jacket sleeves end above the elbow ---------
src = src.replace(
"""      const nape = new THREE.Mesh(new THREE.SphereGeometry(0.070 * s, 14, 10), this.mats.hair);
      nape.position.set(0, CRANIUM_Y - 0.026 * s, -0.052 * s);
      nape.scale.set(0.95, 1.15, 0.62);
      this.head.add(nape);""",
"""      const nape = new THREE.Mesh(new THREE.SphereGeometry(0.062 * s, 14, 10), this.mats.hair);
      nape.position.set(0, CRANIUM_Y - 0.030 * s, -0.044 * s);
      nape.scale.set(0.92, 0.95, 0.55);
      this.head.add(nape);""")

# --- boots: rounded toe box rather than a slab ---------------------------
src = src.replace(
"""      const bootTop = add(foot, new THREE.CylinderGeometry(0.052 * s, 0.058 * s, 0.16 * s, 10), this.mats.boot, 0, 0.085 * s, 0);
      const boot = add(foot, new THREE.BoxGeometry(0.082 * s, 0.062 * s, 0.235 * s), this.mats.boot, 0, 0.032 * s, 0.042 * s);
      const toe = add(foot, new THREE.BoxGeometry(0.076 * s, 0.05 * s, 0.05 * s), this.mats.boot, 0, 0.028 * s, 0.148 * s);
      toe.scale.z = 0.7;
      add(foot, new THREE.BoxGeometry(0.086 * s, 0.016 * s, 0.25 * s), this.mats.sole, 0, 0.006 * s, 0.045 * s);
      add(foot, new THREE.BoxGeometry(0.084 * s, 0.026 * s, 0.055 * s), this.mats.sole, 0, 0.022 * s, -0.062 * s);
      if (mage) add(foot, new THREE.BoxGeometry(0.09 * s, 0.012 * s, 0.03 * s), this.mats.trim, 0, 0.10 * s, 0.045 * s);""",
"""      add(foot, new THREE.CylinderGeometry(0.049 * s, 0.056 * s, 0.17 * s, 12), this.mats.boot, 0, 0.088 * s, 0);
      // ankle mass flows into the toe without a hard step
      const ankle = add(foot, new THREE.SphereGeometry(0.048 * s, 12, 9), this.mats.boot, 0, 0.020 * s, 0.010 * s);
      ankle.scale.set(0.92, 0.70, 1.15);
      const vamp = add(foot, new THREE.SphereGeometry(0.045 * s, 12, 9), this.mats.boot, 0, 0.026 * s, 0.072 * s);
      vamp.scale.set(0.92, 0.62, 1.55);
      // sole follows the boot outline
      const sole = add(foot, new THREE.SphereGeometry(0.044 * s, 12, 6), this.mats.sole, 0, 0.006 * s, 0.048 * s);
      sole.scale.set(0.98, 0.30, 1.92);
      add(foot, new THREE.CylinderGeometry(0.050 * s, 0.052 * s, 0.012 * s, 12), this.mats.sole, 0, -0.004 * s, -0.030 * s).scale.z = 1.4;
      if (mage) add(foot, new THREE.TorusGeometry(0.054 * s, 0.0045 * s, 4, 14), this.mats.trim, 0, 0.104 * s, 0).rotation.x = Math.PI / 2;""")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("silhouette polished")
