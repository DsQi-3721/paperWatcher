// Made-up books for the reader's lab and tests: a Chinese novel (headings, emphasis, ruby, a quote, a list, a picture,
// a passage in English) and a short comic. Nothing here is loaded by the app.
import type { Block, Chapter, FixedDoc, FlowDoc, Run } from './types';

const SEEDS = [
  '春天来得很慢，像是有人在门外犹豫了很久才轻轻敲门。',
  '教室的窗户开着，风把试卷的一角吹起来，又放下。',
  '他把铅笔削得很尖，削笔机咔哒咔哒地响，像一只不肯睡觉的钟。',
  '同桌在三八线那边画了一只小猪，又在旁边写上了他的名字。',
  '放学的铃声响起来的时候，操场上的影子已经拉得很长很长了。',
  '她说话的声音很轻，可是每一个字都落在了该落的地方。',
  '那年的夏天格外地热，知了在树上一刻也不停，好像要把整个夏天都喊出来。',
  '图书馆二楼靠窗的位置总是空着，阳光照在桌面上，灰尘在光里慢慢地飘。',
  '我们沿着河边走，谁也没有说话，只听见水声和自己的脚步声。',
  '“你相信吗？”他忽然问，“有些事情，要过很多年才会明白。”',
];
const EN = 'The afternoon light lay across the desk like a sheet of warm paper, and for a while nobody turned a page.';

function para(seed: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += SEEDS[(seed * 7 + i * 3) % SEEDS.length];
  return s;
}
const runs = (text: string): Run[] => [{ text }];

/** A picture for the novel: a little hand-drawn window, as a PNG blob (needs a DOM canvas). */
async function picture(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 400;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3e7cf'; g.fillRect(0, 0, 640, 400);
  g.strokeStyle = '#231e16'; g.lineWidth = 6; g.strokeRect(120, 60, 400, 280);
  g.beginPath(); g.moveTo(320, 60); g.lineTo(320, 340); g.moveTo(120, 200); g.lineTo(520, 200); g.stroke();
  g.fillStyle = '#9cc6dc'; for (const [x, y] of [[126, 66], [326, 66], [126, 206], [326, 206]]) g.fillRect(x, y, 188, 128);
  g.fillStyle = '#f4b829'; g.beginPath(); g.arc(440, 120, 34, 0, Math.PI * 2); g.fill();
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}

export async function sampleNovel(): Promise<FlowDoc> {
  const chapters: Chapter[] = [];
  const titles = ['序章 风起', '第一章 削笔机', '第二章 三八线', '第三章 图书馆的下午', '第四章 河边', '第五章 很多年以后'];
  titles.forEach((title, ci) => {
    const blocks: Block[] = [{ t: 'h2', runs: runs(title) }];
    const n = ci === 0 ? 6 : 26 + ci * 9;
    for (let i = 0; i < n; i++) {
      if (ci === 1 && i === 4) blocks.push({ t: 'p', runs: [{ text: '他记得那台' }, { text: '手摇削笔机', b: true }, { text: '，红色的，摇起来' }, { text: '咔哒咔哒', i: true }, { text: '地响。旁边有人小声念：' }, { text: '削', ruby: 'xiāo' }, { text: '。' }] });
      else if (ci === 2 && i === 6) blocks.push({ t: 'quote', runs: runs('“过线了！”她用尺子敲了敲桌面，“这边是我的。”') });
      else if (ci === 2 && i === 12) for (const li of ['一块橡皮', '两支铅笔', '一张写满答案的草稿纸']) blocks.push({ t: 'li', runs: runs(li) });
      else if (ci === 3 && i === 8) blocks.push({ t: 'img', src: 'window.png', alt: '窗', w: 640, h: 400 });
      else if (ci === 3 && i === 9) blocks.push({ t: 'p', runs: runs(EN + ' ' + EN) });
      else if (ci === 4 && i === 10) blocks.push({ t: 'h3', runs: runs('一') });
      else blocks.push({ t: 'p', runs: runs(para(ci * 31 + i, 1 + ((i * 5 + ci) % 5))) });
    }
    if (ci === titles.length - 1) blocks.push({ t: 'hr' }, { t: 'center', runs: runs('（完）') });
    const chars = blocks.reduce((a, b) => a + ('runs' in b ? b.runs.reduce((x, r) => x + r.text.length, 0) : 0), 0);
    chapters.push({ title, blocks, chars });
  });
  return {
    kind: 'flow', title: '春日纪事', author: '佚名', lang: 'zh', cover: null,
    chapters, toc: chapters.map((c, i) => ({ title: c.title!, chapter: i })),
    resources: new Map([['window.png', await picture()]]),
  };
}

/** A short comic: page panels with numbers, drawn on demand. */
export function sampleComic(pages = 12, rtl = true): FixedDoc {
  const W = 800, H = 1200;
  return {
    kind: 'fixed', title: '桌上的小剧场', author: '画手', rtl, cover: null, pages,
    size: () => ({ w: W, h: H }),
    async render(i, widthPx) {
      const k = Math.max(0.2, widthPx / W), c = document.createElement('canvas');
      c.width = Math.round(W * k); c.height = Math.round(H * k);
      const g = c.getContext('2d')!;
      g.scale(k, k);
      g.fillStyle = '#fffdf6'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#231e16'; g.lineWidth = 6;
      const rows = 3, gap = 24, ph = (H - gap * (rows + 1)) / rows;
      for (let r = 0; r < rows; r++) {
        const split = (i + r) % 2 ? [0.42] : [0.6];
        let x0 = gap;
        for (const f of [...split, 1]) {
          const x1 = gap + (W - 2 * gap) * f, y0 = gap + r * (ph + gap);
          g.strokeRect(x0, y0, x1 - x0 - (f < 1 ? gap / 2 : 0), ph);
          g.fillStyle = ['#f4b829', '#ef6a4c', '#93d3b0', '#76a0e2', '#f3a6bb'][(i + r) % 5];
          g.beginPath(); g.arc((x0 + x1) / 2, y0 + ph / 2, Math.min(ph, x1 - x0) * 0.22, 0, Math.PI * 2); g.fill(); g.stroke();
          x0 = x1 + gap / 2;
        }
      }
      g.fillStyle = '#231e16'; g.font = '700 48px ui-monospace, monospace'; g.textAlign = 'center';
      g.fillText(String(i + 1), W / 2, H - 6);
      return c;
    },
    toc: [{ title: '第一话', chapter: 0, block: 0 }, { title: '第二话', chapter: 0, block: 6 }],
  };
}
