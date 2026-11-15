import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

start = src.index("    // eyes: seated in the face so the sclera crests the surface")
end_marker = "      this.eyes.push(eye);\n    }\n"
end = src.index(end_marker) + len(end_marker)

NEW = '''    // eyes: the sclera crests the face, a dark crease above reads as a lid.
    // No 3D eyelid caps — they swallowed the eyeball and left a slit.
    this.eyes = [];
    const eyeX = 0.035 * s, eyeY = 0.003 * s;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * eyeX, CRANIUM_Y + eyeY, faceZ(eyeX, eyeY) - 0.0085 * s);
      this.head.add(eye);
      // socket shadow, slightly larger than the eye
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.024 * s, 14, 10), this.mats.socket);
      socket.scale.set(1.14, 0.72, 0.30);
      socket.position.z = -0.001 * s;
      eye.add(socket);
      if (mage) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.0125 * s, 12, 9), this.mats.eye);
        glow.scale.set(1.24, 0.88, 0.5);
        glow.position.z = 0.0085 * s;
        eye.add(glow);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0048 * s, 8, 6), this.mats.void);
        pupil.position.z = 0.0155 * s;
        pupil.scale.set(1, 1.5, 0.4);
        eye.add(pupil);
      } else {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.0205 * s, 16, 12), this.mats.eyeWhite);
        white.scale.set(1.10, 0.94, 0.62);
        white.position.z = 0.004 * s;
        eye.add(white);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0112 * s, 14, 10), this.mats.eye);
        iris.scale.set(1, 1, 0.48);
        iris.position.z = 0.0135 * s;
        eye.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0054 * s, 10, 8), this.mats.void);
        pupil.scale.set(1, 1, 0.45);
        pupil.position.z = 0.0178 * s;
        eye.add(pupil);
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0030 * s, 7, 6), this.mats.eyeWhite);
        spark.position.set(-sx * 0.0045 * s, 0.0055 * s, 0.0196 * s);
        eye.add(spark);
      }
      // upper lash line: a thin curved band hugging the top of the eye
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0205 * s, 0.0026 * s, 4, 16, Math.PI * 0.92), this.mats.lash);
      lash.position.set(0, 0.0012 * s, 0.009 * s);
      lash.rotation.set(0.16, 0, Math.PI * 0.04);
      lash.scale.set(1.10, 0.94, 1);
      eye.add(lash);
      // crease above the eye
      const crease = new THREE.Mesh(new THREE.TorusGeometry(0.0235 * s, 0.0016 * s, 4, 16, Math.PI * 0.72), this.mats.crease);
      crease.position.set(0, 0.0075 * s, 0.006 * s);
      crease.rotation.set(0.20, 0, Math.PI * 0.10);
      crease.scale.set(1.08, 0.9, 1);
      eye.add(crease);
      this.eyes.push(eye);
    }
'''

src = src[:start] + NEW + src[end:]

# new materials for socket / lash / crease
src = src.replace(
"      void: new THREE.MeshBasicMaterial({ color: 0x050608 }),",
"""      void: new THREE.MeshBasicMaterial({ color: 0x050608 }),
      socket: std(mage ? 0x3a2b26 : 0x8f6455, 0.85, 0.0),
      lash: std(mage ? 0x14121a : 0x1a1216, 0.8, 0.05),
      crease: std(mage ? 0x62463c : 0xa87a67, 0.86, 0.0),""")

# mask clear of the nose, and the cowl opening a little wider
src = src.replace("Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.60, Math.PI * 0.20", "Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.64, Math.PI * 0.18")
src = src.replace("      mask.position.set(0, CRANIUM_Y, 0.0);\n      mask.scale.set(1.0, 1.05, 1.02);", "      mask.position.set(0, CRANIUM_Y - 0.004 * s, 0.0);\n      mask.scale.set(1.0, 1.02, 1.02);")
src = src.replace("maskTrim.position.set(0, CRANIUM_Y - 0.030 * s, 0.026 * s);", "maskTrim.position.set(0, CRANIUM_Y - 0.034 * s, 0.028 * s);")

# brows sit right above the eyes
src = src.replace("    const browY = 0.031 * s;", "    const browY = 0.030 * s;")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("eyes rebuilt")
