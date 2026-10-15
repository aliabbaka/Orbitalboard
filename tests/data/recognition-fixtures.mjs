// Procedural geometry regression only. These are NOT human handwriting samples or writer-accuracy evidence.
export function diagramObjects(occupations = [2, 2, 2, 2, 2, 1, 1, 0], variant = 0) {
  const objects = []; let id = 0; const dx = variant * 0.7, dy = variant * 0.4, scale = 0.85 + (variant % 4) * 0.1;
  const stroke = points => {
    points = points.map(([x, y]) => [(x + dx) * scale, (y + dy) * scale]);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    objects.push({ id: `s-${id++}`, type: 'ink', x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)), token: 'ink', strokeWidth: 2, points });
  };
  occupations.forEach((count, i) => {
    const y = (occupations.length + 1 - i) * 65;
    stroke([[80, y], [100, y + (variant % 2) * .3], [140, y]]);
    for (let electron = 0; electron < count; electron++) {
      const x = electron === 0 ? 102 : 120, up = electron === 0;
      stroke([[x, y - 18], [x, y + 10]]);
      stroke(up ? [[x - 5, y - 11], [x, y - 18], [x + 5, y - 11]] : [[x - 5, y + 3], [x, y + 10], [x + 5, y + 3]]);
    }
  }); return objects;
}
export const SYNTHETIC_CASES = Array.from({ length: 24 }, (_, i) => ({ id: `procedural-${i + 1}`, origin: 'synthetic-geometry', writer: null,
  objects: diagramObjects(i % 2 ? [2, 2, 2, 2, 2, 0, 0, 0] : [2, 2, 2, 2, 2, 1, 1, 0], i),
  expected: i % 2 ? '1: ↑↓\n2: ↑↓\n3: ↑↓\n4: ↑↓\n5: ↑↓\n6:\n7:\n8:' : '1: ↑↓\n2: ↑↓\n3: ↑↓\n4: ↑↓\n5: ↑↓\n6: ↑\n7: ↑\n8:' }));
