import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# collar: a fitted roll around the base of the neck, on the shoulders,
# narrow enough that it never crosses the jaw
src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.079 * s, 0.108 * s, 0.10 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.406 * s;
      collar.rotation.x = -0.05;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);
      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.081 * s, 0.006 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.455 * s;
      collarTrim.rotation.x = Math.PI / 2;
      this.chest.add(collarTrim);""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * s, 0.098 * s, 0.085 * s, 16, 1, true), this.mats.coat);
      collar.position.y = 0.352 * s;
      collar.rotation.x = -0.04;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);
      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.063 * s, 0.005 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.394 * s;
      collarTrim.rotation.x = Math.PI / 2;
      this.chest.add(collarTrim);
      // open lapels falling away from the collar
      for (const sx of [-1, 1]) {
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.048 * s, 0.13 * s, 0.016), this.mats.coat);
        lap.position.set(sx * 0.070 * s, 0.318 * s, 0.062 * s);
        lap.rotation.set(-0.10, 0, sx * 0.30);
        this.chest.add(lap);
      }""")

src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.072 * s, 0.099 * s, 0.08 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.402 * s;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.058 * s, 0.090 * s, 0.075 * s, 16, 1, true), this.mats.coat);
      collar.position.y = 0.350 * s;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);
      // popped jacket collar: two flaps behind the jaw
      for (const sx of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.050 * s, 0.10 * s, 0.016), this.mats.coat);
        flap.position.set(sx * 0.062 * s, 0.392 * s, -0.018 * s);
        flap.rotation.set(0.18, 0, sx * 0.26);
        this.chest.add(flap);
      }""")

# mage mask: narrow band from under the nose to the chin
src = src.replace(
"""      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.045, 20, 12, Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.64, Math.PI * 0.18),
        this.mats.coat2
      );
      mask.position.set(0, CRANIUM_Y - 0.004 * s, 0.0);
      mask.scale.set(1.0, 1.02, 1.02);
      mask.material.side = THREE.DoubleSide;
      this.head.add(mask);""",
"""      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.035, 22, 14, Math.PI * 0.5 - 0.88, 1.76, Math.PI * 0.605, Math.PI * 0.30),
        this.mats.coat2
      );
      mask.position.set(0, CRANIUM_Y - 0.002 * s, 0.0);
      mask.scale.set(1.0, 1.0, 1.0);
      mask.material.side = THREE.DoubleSide;
      this.head.add(mask);""")
src = src.replace("maskTrim.position.set(0, CRANIUM_Y - 0.034 * s, 0.028 * s);", "maskTrim.position.set(0, CRANIUM_Y - 0.020 * s, 0.040 * s);")
src = src.replace("maskTrim.rotation.set(1.5, 0, -Math.PI * 0.43);", "maskTrim.rotation.set(1.58, 0, -Math.PI * 0.44);")
src = src.replace("new THREE.TorusGeometry(0.074 * s, 0.004 * s, 4, 20, Math.PI * 0.86)", "new THREE.TorusGeometry(0.066 * s, 0.0035 * s, 4, 20, Math.PI * 0.80)")

# neck wrap must not reach the jaw
src = src.replace(
"""      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052 * s, 0.062 * s, 0.075 * s, 14, 1, true), this.mats.cloth);
      wrap.position.set(0, -0.052 * s, 0.002);""",
"""      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.048 * s, 0.060 * s, 0.065 * s, 14, 1, true), this.mats.cloth);
      wrap.position.set(0, -0.062 * s, 0.002);""")

# smaller, less blocky brows
src = src.replace("const brow = new THREE.Mesh(new THREE.BoxGeometry(0.0115 * s, 0.0042 * s, 0.008), this.mats.brow);",
                  "const brow = new THREE.Mesh(new THREE.BoxGeometry(0.0105 * s, 0.0034 * s, 0.007), this.mats.brow);")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("collar fixed")
