// What moves together in arrange mode (see layout.ts): the four shared papers with the stationery working on each,
// every other object on its own (with its own props), the blank sheet, the deskmate's textbook and each pile spot.
import { GROUP_OF, movePlace, PAPERS, PILE_SPOTS, READING_SPOT, TEXTBOOK, type PaperDef, type Unit } from './layout';
import { OBJECTS } from './objects/index';

const GROUP_NAMES: Record<string, string> = {
  G1: '数学小测 · 铅笔 · 修正带 · 钢尺', G2: '英语默写 · 中性笔 · 橡皮', G3: '数学练习 · 圆规 · 计算器', G4: '期中考试 · 订书机 · 夹子',
};
const PAPER_GROUPS = ['G1', 'G2', 'G3', 'G4'];
const centre = (d: PaperDef): [number, number] => [(d.rect[0] + d.rect[2]) / 2, (d.rect[1] + d.rect[3]) / 2];

export const UNITS: Unit[] = [];
export const unitOfObj: Record<string, Unit> = {};
export const unitOfPaper: Record<string, Unit> = {};

for (const g of PAPER_GROUPS) {
  const papers = PAPERS.filter((d) => GROUP_OF[d.id] === g);
  const u: Unit = { id: g, name: GROUP_NAMES[g], objs: OBJECTS.filter((e) => GROUP_OF[e.n] === g).map((e) => e.id), papers: papers.map((d) => d.id),
    pivot: centre(papers[0]), lock: g === 'G1' ? 'u' : g === 'G2' ? 'v' : undefined };
  UNITS.push(u);
}
for (const e of OBJECTS) {
  if (PAPER_GROUPS.includes(GROUP_OF[e.n])) continue;
  const at = movePlace(e.n, e.place);
  UNITS.push({ id: e.id, name: '', objs: [e.id], papers: [], pivot: [at.u, at.v] });
}
UNITS.push({ id: 'blank', name: '空白草稿纸（读论文的地方）', objs: [], papers: ['blank'], pivot: centre(READING_SPOT) });
UNITS.push({ id: 'book', name: '同桌的语文书', objs: [], papers: ['book'], pivot: centre(TEXTBOOK) });
PILE_SPOTS.forEach((sp, i) => UNITS.push({ id: 'pile' + i, name: i ? '另一摞读过的论文' : '读过的论文', objs: [], papers: [], pivot: [sp.u, sp.v], pile: i }));
for (const u of UNITS) {
  for (const o of u.objs) unitOfObj[o] = u;
  for (const p of u.papers) unitOfPaper[p] = u;
}
export const unitById = (id: string) => UNITS.find((u) => u.id === id);
