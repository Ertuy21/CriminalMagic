import fs from 'node:fs';
const s = fs.readFileSync('src/characters.js', 'utf8');
for (const n of ['BIRD_SPECIES', 'LAND_SPECIES', 'MARINE_SPECIES', 'REPTILE_SPECIES', 'INSECT_SPECIES']) {
  const start = s.indexOf('const ' + n);
  const end = s.indexOf('\n];', start);
  const block = s.slice(start, end);
  const count = (block.match(/'/g) || []).length / 2;
  console.log(n, count);
}
