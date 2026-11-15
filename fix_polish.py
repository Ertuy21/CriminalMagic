import io
p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# 1) torso ends below the chin and tapers at the waist
src = src.replace(
"""    const torso = latheGeo([
      [0.005, -0.08], [0.112, -0.07], [0.132, -0.01], [0.126, 0.07],
      [0.118, 0.14], [0.126, 0.21], [0.146, 0.29], [0.157, 0.35],
      [0.152, 0.40], [0.128, 0.435], [0.082, 0.455], [0.05, 0.465], [0.02, 0.468],
    ], 20);""",
"""    const torso = latheGeo([
      [0.005, -0.08], [0.110, -0.07], [0.128, -0.01], [0.120, 0.07],
      [0.112, 0.14], [0.122, 0.21], [0.144, 0.29], [0.156, 0.345],
      [0.148, 0.385], [0.118, 0.412], [0.072, 0.428], [0.040, 0.436], [0.016, 0.439],
    ], 22);""")

# 2) wider shoulders, matching a ~3-head build
src = src.replace(
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.072 * s, 12, 9), mage ? this.mats.coat : this.mats.coat);
      delt.position.set(sx * 0.175 * s, 0.40 * s, 0);""",
"""      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.077 * s, 14, 10), this.mats.coat);
      delt.position.set(sx * 0.200 * s, 0.372 * s, 0);""")
src = src.replace(
"""        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.078 * s, 10, 6, 0, TAU, 0, Math.PI * 0.5), this.mats.coat2);
        pad.position.set(sx * 0.175 * s, 0.415 * s, 0);""",
"""        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.083 * s, 12, 7, 0, TAU, 0, Math.PI * 0.5), this.mats.coat2);
        pad.position.set(sx * 0.200 * s, 0.388 * s, 0);""")
src = src.replace(
"""        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.074 * s, 0.006 * s, 5, 14, Math.PI), this.mats.trim);
        rim.position.set(sx * 0.175 * s, 0.398 * s, 0);""",
"""        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.079 * s, 0.0055 * s, 5, 16, Math.PI), this.mats.trim);
        rim.position.set(sx * 0.200 * s, 0.372 * s, 0);""")

src = src.replace(
"""      shoulder.position.set(sx * 0.185 * s, 0.40 * s, 0);
      this.chest.add(shoulder);""",
"""      shoulder.position.set(sx * 0.198 * s, 0.372 * s, 0);
      this.chest.add(shoulder);""")

# 3) neck attachment follows the lower torso top
src = src.replace("    this.neck.position.y = 0.455 * s;", "    this.neck.position.y = 0.428 * s;")

# 4) collars sit on the shoulders, not at the jaw
src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082 * s, 0.112 * s, 0.11 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.432 * s;
      collar.rotation.x = -0.05;""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.079 * s, 0.108 * s, 0.10 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.406 * s;
      collar.rotation.x = -0.05;""")
src = src.replace(
"""      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.084 * s, 0.0065 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.482 * s;""",
"""      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.081 * s, 0.006 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.455 * s;""")
src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.074 * s, 0.102 * s, 0.085 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.428 * s;""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.072 * s, 0.099 * s, 0.08 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.402 * s;""")

# 5) eyes: bigger, proud of the surface, no black lash bars
src = src.replace(
"""      if (mage) {
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
      this.eyes.push(eye);""",
"""      if (mage) {
        // a narrow lid opening with a bright rune iris inside
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.0205 * s, 14, 10), this.mats.void);
        socket.scale.set(1.28, 0.86, 0.62);
        eye.add(socket);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.0115 * s, 10, 8), this.mats.eye);
        glow.position.z = 0.008 * s;
        glow.scale.set(1.28, 0.86, 0.55);
        eye.add(glow);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0045 * s, 8, 6), this.mats.void);
        pupil.position.z = 0.0155 * s;
        pupil.scale.set(1, 1.4, 0.4);
        eye.add(pupil);
      } else {
        // sclera, iris, pupil and a specular dot
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.0195 * s, 16, 12), this.mats.eyeWhite);
        white.scale.set(1.16, 0.95, 0.70);
        eye.add(white);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0108 * s, 14, 10), this.mats.eye);
        iris.position.z = 0.0092 * s;
        iris.scale.set(1, 1, 0.5);
        eye.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0052 * s, 10, 8), this.mats.void);
        pupil.position.z = 0.0134 * s;
        pupil.scale.set(1, 1, 0.5);
        eye.add(pupil);
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0028 * s, 7, 6), this.mats.eyeWhite);
        spark.position.set(-sx * 0.0042 * s, 0.0052 * s, 0.0158 * s);
        eye.add(spark);
      }
      // eyelids: thin skin caps above and below, angled inward
      const lidTop = new THREE.Mesh(new THREE.SphereGeometry(0.0202 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.40), this.mats.skin);
      lidTop.position.set(0, 0.0015 * s, 0.0012 * s);
      lidTop.scale.set(1.14, 0.96, 0.72);
      lidTop.rotation.set(0.34, 0, sx * 0.06);
      eye.add(lidTop);
      const lidBot = new THREE.Mesh(new THREE.SphereGeometry(0.0198 * s, 12, 7, 0, Math.PI * 2, Math.PI * 0.60, Math.PI * 0.34), this.mats.skin);
      lidBot.position.set(0, -0.0015 * s, 0.0012 * s);
      lidBot.scale.set(1.14, 0.96, 0.72);
      lidBot.rotation.set(-0.30, 0, -sx * 0.04);
      eye.add(lidBot);
      this.eyes.push(eye);""")

# 6) brows: softer colour and a slight arc instead of one dark bar
src = src.replace(
"""    const browY = 0.032 * s, browX = 0.035 * s;
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.031 * s, 0.0058 * s, 0.009), this.mats.brow);
      brow.position.set(sx * browX, CRANIUM_Y + browY, faceZ(browX, browY) - 0.003 * s);
      brow.rotation.z = sx * -0.12;
      brow.rotation.x = -0.18;
      this.head.add(brow);
    }""",
"""    const browY = 0.031 * s;
    for (const sx of [-1, 1]) {
      // three short segments make a curved brow that hugs the forehead
      for (let k = 0; k < 3; k++) {
        const x = sx * (0.022 * s + k * 0.010 * s);
        const y = browY + (k === 1 ? 0.0018 * s : 0) - k * 0.0016 * s;
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.0115 * s, 0.0042 * s, 0.008), this.mats.brow);
        brow.position.set(x, CRANIUM_Y + y, faceZ(Math.abs(x), y) - 0.0035 * s);
        brow.rotation.z = sx * (-0.16 + k * 0.07);
        brow.rotation.x = -0.20;
        brow.rotation.y = -sx * 0.20;
        this.head.add(brow);
      }
    }""")

# 7) mouth: thin lips, not a blob
src = src.replace(
"""    const mouthY = -0.042 * s;
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
    this.head.add(parting);""",
"""    const mouthY = -0.044 * s;
    const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.0175 * s, 12, 7), this.mats.lip);
    upperLip.position.set(0, CRANIUM_Y + mouthY + 0.0028 * s, faceZ(0, mouthY) - 0.0075 * s);
    upperLip.scale.set(1.0, 0.20, 0.28);
    this.head.add(upperLip);
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.0185 * s, 12, 7), this.mats.lip);
    this.mouth.position.set(0, CRANIUM_Y + mouthY - 0.0032 * s, faceZ(0, mouthY) - 0.0075 * s);
    this.mouth.scale.set(1.0, 0.24, 0.28);
    this.head.add(this.mouth);
    const parting = new THREE.Mesh(new THREE.BoxGeometry(0.028 * s, 0.0018 * s, 0.0035), this.mats.void);
    parting.position.set(0, CRANIUM_Y + mouthY - 0.0002 * s, faceZ(0, mouthY) - 0.0065 * s);
    this.head.add(parting);""")

# 8) mask sits lower so the nose shows; hood opening kept wide
src = src.replace("Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.52, Math.PI * 0.24", "Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.60, Math.PI * 0.20")
src = src.replace("maskTrim.position.set(0, CRANIUM_Y - 0.018 * s, 0.020 * s);", "maskTrim.position.set(0, CRANIUM_Y - 0.030 * s, 0.026 * s);")

# 9) softer brow colour than pure black
src = src.replace("brow: std(mage ? 0x201d24 : 0x201619, 0.85),", "brow: std(mage ? 0x2a2530 : 0x2b1d21, 0.88),")

io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("polished")
