import io

p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# face features must sit ON the cranium surface: at lateral x and height y,
# the surface is z = sqrt(R^2 - x^2 - y^2) (cranium z-scale is 1.0)
old = """    // nose: a small wedge pressed into the face
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017 * s, 0.05 * s, 6), this.mats.skin);
    nose.position.set(0, CRANIUM_Y + 0.012 * s, 0.079 * s);
    nose.rotation.x = Math.PI * 0.52;
    nose.scale.set(1.0, 1.0, 0.62);
    this.head.add(nose);
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.0125 * s, 8, 6), this.mats.skin);
    noseTip.position.set(0, CRANIUM_Y - 0.011 * s, 0.086 * s);
    noseTip.scale.set(1.1, 0.85, 0.8);
    this.head.add(noseTip);
    for (const sx of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.0085 * s, 6, 5), this.mats.skinDark);
      nostril.position.set(sx * 0.0115 * s, CRANIUM_Y - 0.020 * s, 0.078 * s);
      nostril.scale.set(1, 0.75, 0.55);
      this.head.add(nostril);
    }

    // eyes, flush with the face, at the head's mid line
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.034 * s, CRANIUM_Y + 0.002 * s, 0.070 * s);
      this.head.add(eye);
      if (mage) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.0175 * s, 10, 8), this.mats.void);
        socket.scale.set(1.25, 0.85, 0.4);
        socket.position.z = 0.004 * s;
        eye.add(socket);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.0085 * s, 8, 6), this.mats.eye);
        glow.position.z = 0.010 * s;
        glow.scale.set(1.4, 0.72, 0.4);
        eye.add(glow);
      } else {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.0145 * s, 12, 9), this.mats.eyeWhite);
        white.scale.set(1.25, 0.9, 0.5);
        eye.add(white);
        const iris = new THREE.Mesh(new THREE.CylinderGeometry(0.0068 * s, 0.0068 * s, 0.004 * s, 10), this.mats.eye);
        iris.rotation.x = Math.PI / 2;
        iris.position.z = 0.0068 * s;
        eye.add(iris);
        const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.0045 * s, 8), this.mats.void);
        pupil.rotation.x = Math.PI / 2;
        pupil.position.z = 0.0082 * s;
        eye.add(pupil);
        // lash line along the top of the eye only
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.030 * s, 0.0035 * s, 0.006), this.mats.brow, 0, 0, 0);
        lash.position.set(0, 0.0075 * s, 0.0035 * s);
        lash.rotation.z = sx * 0.06;
        eye.add(lash);
      }
      this.eyes.push(eye);
    }
    // brows, above the eyes with a clear gap
    for (const sx of [-1, 1]) {
      const brow = add(this.head, new THREE.BoxGeometry(0.030 * s, 0.0055 * s, 0.010), this.mats.brow,
        sx * 0.035 * s, CRANIUM_Y + 0.030 * s, 0.076 * s);
      brow.rotation.z = sx * -0.11;
      brow.rotation.x = -0.16;
    }
    // lips
    const upperLip = add(this.head, new THREE.SphereGeometry(0.019 * s, 10, 6), this.mats.lip, 0, CRANIUM_Y - 0.052 * s, 0.072 * s);
    upperLip.scale.set(1.05, 0.26, 0.35);
    this.mouth = add(this.head, new THREE.SphereGeometry(0.021 * s, 10, 6), this.mats.lip, 0, CRANIUM_Y - 0.058 * s, 0.072 * s);
    this.mouth.scale.set(1.05, 0.3, 0.36);
    add(this.head, new THREE.BoxGeometry(0.036 * s, 0.0026 * s, 0.005), this.mats.void, 0, CRANIUM_Y - 0.0555 * s, 0.076 * s);
    // ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 8, 7), this.mats.skin);
      ear.position.set(sx * 0.083 * s, CRANIUM_Y - 0.002 * s, 0.0);
      ear.scale.set(0.45, 1.05, 0.8);
      this.head.add(ear);
      if (!mage) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0105 * s, 0.0028 * s, 4, 10), this.mats.gold);
        ring.position.set(sx * 0.085 * s, CRANIUM_Y - 0.024 * s, 0.004);
        ring.rotation.y = Math.PI / 2;
        this.head.add(ring);
      }
    }"""

new = """    // surface helper: depth of the face at a lateral offset and height
    const faceZ = (x, y) => Math.sqrt(Math.max(0.0004, R * R - x * x - y * y)) * 0.99;

    // nose: bridge wedge plus rounded tip, both sitting proud of the face
    const noseY = 0.010 * s;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016 * s, 0.048 * s, 6), this.mats.skin);
    nose.position.set(0, CRANIUM_Y + noseY, faceZ(0, noseY) - 0.004 * s);
    nose.rotation.x = Math.PI * 0.52;
    nose.scale.set(1.0, 1.0, 0.55);
    this.head.add(nose);
    const tipY = -0.010 * s;
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.0125 * s, 9, 7), this.mats.skin);
    noseTip.position.set(0, CRANIUM_Y + tipY, faceZ(0, tipY) - 0.003 * s);
    noseTip.scale.set(1.15, 0.85, 0.85);
    this.head.add(noseTip);
    for (const sx of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.008 * s, 6, 5), this.mats.skinDark);
      nostril.position.set(sx * 0.0115 * s, CRANIUM_Y + tipY - 0.008 * s, faceZ(0.0115 * s, tipY) - 0.004 * s);
      nostril.scale.set(1, 0.7, 0.5);
      this.head.add(nostril);
    }

    // eyes: seated in the face so the sclera crests the surface
    this.eyes = [];
    const eyeX = 0.034 * s, eyeY = 0.004 * s;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * eyeX, CRANIUM_Y + eyeY, faceZ(eyeX, eyeY) - 0.006 * s);
      this.head.add(eye);
      if (mage) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.019 * s, 12, 9), this.mats.void);
        socket.scale.set(1.3, 0.92, 0.55);
        eye.add(socket);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.0105 * s, 9, 7), this.mats.eye);
        glow.position.z = 0.0055 * s;
        glow.scale.set(1.45, 0.8, 0.55);
        eye.add(glow);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0042 * s, 7, 6), this.mats.void);
        pupil.position.z = 0.0105 * s;
        pupil.scale.set(1, 1.5, 0.4);
        eye.add(pupil);
      } else {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.0165 * s, 14, 10), this.mats.eyeWhite);
        white.scale.set(1.2, 0.92, 0.62);
        eye.add(white);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0088 * s, 12, 9), this.mats.eye);
        iris.position.z = 0.0072 * s;
        iris.scale.set(1, 1, 0.42);
        eye.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0042 * s, 9, 7), this.mats.void);
        pupil.position.z = 0.0102 * s;
        pupil.scale.set(1, 1, 0.42);
        eye.add(pupil);
        // highlight makes the eye read as wet and alive
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0022 * s, 6, 5), this.mats.eyeWhite);
        spark.position.set(-sx * 0.0035 * s, 0.0042 * s, 0.0122 * s);
        eye.add(spark);
      }
      // upper lid: a sliver of skin that overlaps the top of the eye
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0172 * s, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.44), this.mats.skin);
      lid.position.set(0, 0.0022 * s, 0.0015 * s);
      lid.scale.set(1.22, 0.95, 0.68);
      lid.rotation.x = 0.30;
      eye.add(lid);
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.030 * s, 0.0032 * s, 0.0055), this.mats.brow, 0, 0, 0);
      lash.position.set(0, 0.0105 * s, 0.0045 * s);
      lash.rotation.z = sx * 0.07;
      eye.add(lash);
      this.eyes.push(eye);
    }
    // brows: above the eyes, following the skull curvature
    const browY = 0.032 * s, browX = 0.035 * s;
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.031 * s, 0.0058 * s, 0.009), this.mats.brow);
      brow.position.set(sx * browX, CRANIUM_Y + browY, faceZ(browX, browY) - 0.003 * s);
      brow.rotation.z = sx * -0.12;
      brow.rotation.x = -0.18;
      this.head.add(brow);
    }
    // mouth: upper and lower lip with a dark parting line between
    const mouthY = -0.042 * s;
    const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.019 * s, 12, 7), this.mats.lip);
    upperLip.position.set(0, CRANIUM_Y + mouthY + 0.0035 * s, faceZ(0, mouthY) - 0.006 * s);
    upperLip.scale.set(1.02, 0.24, 0.34);
    this.head.add(upperLip);
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.021 * s, 12, 7), this.mats.lip);
    this.mouth.position.set(0, CRANIUM_Y + mouthY - 0.004 * s, faceZ(0, mouthY) - 0.006 * s);
    this.mouth.scale.set(1.02, 0.30, 0.36);
    this.head.add(this.mouth);
    const parting = new THREE.Mesh(new THREE.BoxGeometry(0.032 * s, 0.0022 * s, 0.004), this.mats.void);
    parting.position.set(0, CRANIUM_Y + mouthY - 0.0005 * s, faceZ(0, mouthY) - 0.005 * s);
    this.head.add(parting);
    // philtrum shadow ties the nose to the mouth
    const phil = new THREE.Mesh(new THREE.BoxGeometry(0.007 * s, 0.018 * s, 0.004), this.mats.skinDark);
    phil.position.set(0, CRANIUM_Y - 0.022 * s, faceZ(0, -0.022 * s) - 0.006 * s);
    this.head.add(phil);
    // ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 9, 7), this.mats.skin);
      ear.position.set(sx * 0.082 * s, CRANIUM_Y - 0.002 * s, 0.004 * s);
      ear.scale.set(0.45, 1.05, 0.8);
      this.head.add(ear);
      if (!mage) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0105 * s, 0.0028 * s, 4, 10), this.mats.gold);
        ring.position.set(sx * 0.085 * s, CRANIUM_Y - 0.026 * s, 0.006);
        ring.rotation.y = Math.PI / 2;
        this.head.add(ring);
      }
    }"""

assert old in src, "face block not found"
src = src.replace(old, new)

# mask and fringe shells must clear the face opening by using the same OPEN arc
src = src.replace(
"""      const OPEN = 1.13;
      const hoodGeo = new THREE.SphereGeometry(
        R * 1.12, 22, 16,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.78
      );""",
"""      const OPEN = 1.02;
      const hoodGeo = new THREE.SphereGeometry(
        R * 1.10, 24, 18,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.80
      );""")

src = src.replace(
"""      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.03, 20, 12, Math.PI * 0.5 - 1.16, 2.32, Math.PI * 0.56, Math.PI * 0.26),
        this.mats.coat2
      );
      mask.position.set(0, CRANIUM_Y, 0.0);
      mask.scale.set(0.99, 1.05, 1.02);""",
"""      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.045, 20, 12, Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.52, Math.PI * 0.24),
        this.mats.coat2
      );
      mask.position.set(0, CRANIUM_Y, 0.0);
      mask.scale.set(1.0, 1.05, 1.02);""")

src = src.replace(
"""      const fringe = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.055, 18, 6,
        Math.PI * 0.5 - 0.92, 1.84,
        Math.PI * 0.19, Math.PI * 0.13
      ), this.mats.hair);""",
"""      const fringe = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.05, 20, 6,
        Math.PI * 0.5 - 0.86, 1.72,
        Math.PI * 0.13, Math.PI * 0.15
      ), this.mats.hair);""")

src = src.replace(
"""      const fringeHi = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.062, 12, 5,
        Math.PI * 0.5 + 0.24, 0.62,
        Math.PI * 0.21, Math.PI * 0.10
      ), this.mats.hairHi);""",
"""      const fringeHi = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.058, 14, 5,
        Math.PI * 0.5 + 0.22, 0.58,
        Math.PI * 0.15, Math.PI * 0.11
      ), this.mats.hairHi);""")

src = src.replace(
"""      const cap = add(this.head, new THREE.SphereGeometry(
        R * 1.06, 24, 16,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.72
      ), this.mats.hair, 0, CRANIUM_Y, -0.004 * s);""",
"""      const cap = add(this.head, new THREE.SphereGeometry(
        R * 1.055, 24, 18,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.74
      ), this.mats.hair, 0, CRANIUM_Y, -0.004 * s);""")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("face fixed")
