// コルーチン（ジェネレーター関数）で、敵の動き・弾幕・ステージの進行を「上から順に」書く。
//
//   tasks.add(function* () {
//     yield* e.moveTo(0, 120, 60);     // 60 コマかけて動く
//     for (let i = 0; i < 5; i++) { ring(e.x, e.y, 16, 2.5); yield 20; }   // 20 コマ待つ
//   }(), enemy);                        // owner（敵）が倒れたら止まる
//
// yield n：n コマ後に続きから（yield だけなら次のコマ）。ロジックは固定 60Hz なので、コマ数で書いてよい。

export class Tasks {
  constructor() {
    this.list = [];
    this.frame = 0;
  }

  /** ジェネレーターを足す。owner（.alive を持つもの）が false になったら止める。 */
  add(gen, owner = null, name = '') {
    const t = { gen, wait: 0, owner, name, done: false };
    this.list.push(t);
    return t;
  }

  /** 1 コマ進める。足されたばかりのタスクも、このコマから動く。 */
  tick() {
    this.frame++;
    let dead = 0;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.done) { dead++; continue; }
      if (t.owner && !t.owner.alive) { t.done = true; dead++; continue; }
      if (t.wait > 0) { t.wait--; continue; }
      let r;
      try { r = t.gen.next(); } catch (e) { console.error('[tasks]', t.name, e); t.done = true; dead++; continue; }
      if (r.done) { t.done = true; dead++; continue; }
      const n = typeof r.value === 'number' && r.value > 1 ? Math.floor(r.value) : 1;
      t.wait = n - 1;
    }
    if (dead > 16 || (dead && this.list.length < 64)) this.list = this.list.filter((t) => !t.done);
  }

  /** owner のタスクを全部止める。 */
  kill(owner) { for (const t of this.list) if (t.owner === owner) t.done = true; }
  stop(task) { if (task) task.done = true; }
  clear() { for (const t of this.list) t.done = true; this.list = []; }
  get size() { return this.list.filter((t) => !t.done).length; }
}

/** cond() が true になるまで待つ（ジェネレーターの中で yield* waitUntil(...)）。 */
export function* waitUntil(cond, max = Infinity) {
  let n = 0;
  while (!cond() && n++ < max) yield 1;
}
