import io

p = "src/heromodel.js"
src = io.open(p, encoding="utf-8").read()

# --- collars: they sat at eye level and read as headbands -------------------
src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.098 * s, 0.145 * s, 0.15 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.505 * s;
      collar.rotation.x = -0.06;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);
      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.098 * s, 0.008 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.578 * s;
      collarTrim.rotation.x = Math.PI / 2;
      this.chest.add(collarTrim);""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082 * s, 0.112 * s, 0.11 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.432 * s;
      collar.rotation.x = -0.05;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);
      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.084 * s, 0.0065 * s, 5, 16), this.mats.trim);
      collarTrim.position.y = 0.482 * s;
      collarTrim.rotation.x = Math.PI / 2;
      this.chest.add(collarTrim);""")

src = src.replace(
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.088 * s, 0.135 * s, 0.10 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.47 * s;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);""",
"""      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.074 * s, 0.102 * s, 0.085 * s, 14, 1, true), this.mats.coat);
      collar.position.y = 0.428 * s;
      collar.material.side = THREE.DoubleSide;
      this.chest.add(collar);""")

# --- head block -------------------------------------------------------------
start_marker = "    // ---- head -------------------------------------------------------------\n"
end_marker = "    this.head.scale.setScalar(0.97);\n"
i = src.index(start_marker)
j = src.index(end_marker) + len(end_marker)

NEW = '''    // ---- head -------------------------------------------------------------
    // Proportions: head centre at 1.65 m, 0.19 m tall, eyes on the mid line,
    // brows a third of a radius higher, hairline above that.
    this.neck = new THREE.Group();
    this.neck.position.y = 0.455 * s;
    this.chest.add(this.neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.072 * s;
    this.neck.add(this.head);

    const neckMesh = add(this.neck, new THREE.CylinderGeometry(0.042 * s, 0.055 * s, 0.12 * s, 14), this.mats.skin, 0, -0.026 * s, 0.004);
    neckMesh.rotation.x = -0.04;

    const R = 0.093 * s;          // cranium radius
    const CRANIUM_Y = 0.024 * s;  // cranium centre inside the head group
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(R, 26, 20), this.mats.skin);
    cranium.scale.set(0.94, 1.05, 1.0);
    cranium.position.set(0, CRANIUM_Y, 0.0);
    cranium.castShadow = true;
    cranium.receiveShadow = true;
    this.head.add(cranium);
    this.skull = cranium;

    // jaw: narrows to the chin, sits flush with the cranium
    const jawGeo = new THREE.LatheGeometry([
      [0.001, 0.010], [0.066, 0.008], [0.074, -0.012], [0.070, -0.034],
      [0.058, -0.056], [0.040, -0.074], [0.021, -0.086], [0.001, -0.090],
    ].map(p => new THREE.Vector2(Math.max(0.0008, p[0]), p[1])), 22);
    const jaw = add(this.head, jawGeo, this.mats.skin, 0, CRANIUM_Y - 0.006 * s, 0.006);
    jaw.scale.set(0.99, 1.0, 0.94);

    // brow ridge: a shallow arc across the forehead
    const browRidge = new THREE.Mesh(new THREE.SphereGeometry(0.058 * s, 14, 8, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.22), this.mats.skin);
    browRidge.position.set(0, CRANIUM_Y + 0.046 * s, 0.010 * s);
    browRidge.rotation.x = Math.PI * 0.5;
    browRidge.rotation.z = -Math.PI * 0.5;
    browRidge.scale.set(1.0, 1.0, 0.85);
    this.head.add(browRidge);

    // nose: a small wedge pressed into the face
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
    }

    // hook so the animation can raise/lower brows without rebuilding
    this.brows = this.head.children.filter(o => o.geometry && o.geometry.type === 'BoxGeometry');

    if (mage) {
      // Cowl: a shell open across a 130 degree arc at the front. SphereGeometry
      // measures phi from -X, so the face (+Z) sits at phi = PI/2.
      const OPEN = 1.13;
      const hoodGeo = new THREE.SphereGeometry(
        R * 1.12, 22, 16,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.78
      );
      const hood = add(this.head, hoodGeo, this.mats.coat2, 0, CRANIUM_Y, -0.004 * s);
      hood.scale.set(0.99, 1.04, 1.03);
      hood.material.side = THREE.DoubleSide;
      // crown ridged so it is not a plain shell
      const peak = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 12, 8, 0, TAU, 0, Math.PI * 0.5), this.mats.coat2);
      peak.position.set(0, CRANIUM_Y + 0.075 * s, -0.050 * s);
      peak.scale.set(1.0, 0.9, 1.5);
      this.head.add(peak);
      // cloth mask across nose and mouth only
      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.03, 20, 12, Math.PI * 0.5 - 1.16, 2.32, Math.PI * 0.56, Math.PI * 0.26),
        this.mats.coat2
      );
      mask.position.set(0, CRANIUM_Y, 0.0);
      mask.scale.set(0.99, 1.05, 1.02);
      mask.material.side = THREE.DoubleSide;
      this.head.add(mask);
      // trim along the top edge of the mask
      const maskTrim = new THREE.Mesh(new THREE.TorusGeometry(0.074 * s, 0.004 * s, 4, 20, Math.PI * 0.86), this.mats.trim);
      maskTrim.position.set(0, CRANIUM_Y - 0.018 * s, 0.020 * s);
      maskTrim.rotation.set(1.5, 0, -Math.PI * 0.43);
      this.head.add(maskTrim);
      // rune on the forehead, under the cowl
      const mark = add(this.head, new THREE.OctahedronGeometry(0.008 * s, 0), this.mats.rune, 0, CRANIUM_Y + 0.052 * s, 0.058 * s);
      mark.rotation.z = Math.PI / 4;
      // short wrap at the base of the neck
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052 * s, 0.062 * s, 0.075 * s, 14, 1, true), this.mats.cloth);
      wrap.position.set(0, -0.052 * s, 0.002);
      wrap.material.side = THREE.DoubleSide;
      this.neck.add(wrap);
    } else {
      // Hair: same shell trick with a wider face opening, so the face is clear.
      const OPEN = 0.86;
      const cap = add(this.head, new THREE.SphereGeometry(
        R * 1.06, 24, 16,
        Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2,
        0, Math.PI * 0.72
      ), this.mats.hair, 0, CRANIUM_Y, -0.004 * s);
      cap.scale.set(0.99, 1.05, 1.03);
      cap.material.side = THREE.DoubleSide;
      // crown volume
      const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 0.94, 18, 12, 0, TAU, 0, Math.PI * 0.42), this.mats.hair);
      crown.position.set(0, CRANIUM_Y + 0.030 * s, -0.010 * s);
      crown.scale.set(1.0, 0.95, 1.04);
      this.head.add(crown);
      // mass at the nape
      const nape = new THREE.Mesh(new THREE.SphereGeometry(0.070 * s, 14, 10), this.mats.hair);
      nape.position.set(0, CRANIUM_Y - 0.026 * s, -0.052 * s);
      nape.scale.set(0.95, 1.15, 0.62);
      this.head.add(nape);
      // fringe: a band across the forehead, above the brow gap
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.055, 18, 6,
        Math.PI * 0.5 - 0.92, 1.84,
        Math.PI * 0.19, Math.PI * 0.13
      ), this.mats.hair);
      fringe.position.set(0, CRANIUM_Y, -0.004 * s);
      fringe.scale.set(0.99, 1.05, 1.03);
      fringe.rotation.y = 0.10;
      this.head.add(fringe);
      // magenta streak through the fringe on one side
      const fringeHi = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.062, 12, 5,
        Math.PI * 0.5 + 0.24, 0.62,
        Math.PI * 0.21, Math.PI * 0.10
      ), this.mats.hairHi);
      fringeHi.position.set(0, CRANIUM_Y, -0.004 * s);
      fringeHi.scale.set(0.99, 1.05, 1.03);
      this.head.add(fringeHi);
      // long strands in front of the shoulders
      for (const sx of [-1, 1]) {
        const strand = new THREE.Mesh(limbGeo(0.018 * s, 0.007 * s, 0.21 * s, 7), this.mats.hair);
        strand.position.set(sx * 0.070 * s, CRANIUM_Y - 0.008 * s, 0.032 * s);
        strand.rotation.z = sx * 0.05;
        this.head.add(strand);
      }
      const streak = new THREE.Mesh(limbGeo(0.010 * s, 0.004 * s, 0.22 * s, 6), this.mats.hairHi);
      streak.position.set(0.074 * s, CRANIUM_Y - 0.020 * s, 0.024 * s);
      streak.rotation.z = -0.05;
      this.head.add(streak);
      // high ponytail bound at the crown
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.014 * s, 0.0045 * s, 4, 10), this.mats.trim);
      tie.position.set(0, CRANIUM_Y + 0.070 * s, -0.062 * s);
      tie.rotation.x = 1.15;
      this.head.add(tie);
      this.pony = [];
      let parent = this.head;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Group();
        if (i === 0) {
          seg.position.set(0, CRANIUM_Y + 0.068 * s, -0.070 * s);
          seg.rotation.x = -0.85;
        } else seg.position.set(0, -0.100 * s, -0.008);
        parent.add(seg);
        const len = 0.128 * s;
        const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.028 * s - i * 0.0045, len, 4, 8),
          i === 3 ? neon(0xff4fa3) : i === 1 ? this.mats.hairHi : this.mats.hair);
        mesh.position.y = -len / 2;
        mesh.castShadow = true;
        seg.add(mesh);
        this.pony.push(seg);
        parent = seg;
      }
    }
    this.head.scale.setScalar(0.97);
'''

src = src[:i] + NEW + src[j:]
io.open(p, "w", encoding="utf-8", newline="\n").write(src)
print("head rebuilt")
