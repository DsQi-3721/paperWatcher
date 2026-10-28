// Math on scratch paper. Simple inline formulas are turned into Unicode so they are written in the same hand
// as the words around them; anything richer (and display math) is typeset by KaTeX, loaded on first use.

const SYM: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
  varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  sim: '∼', simeq: '≃', equiv: '≡', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
  oint: '∮', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', to: '→', rightarrow: '→', leftarrow: '←', gets: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', implies: '⇒', mapsto: '↦', uparrow: '↑', downarrow: '↓',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱', langle: '⟨', rangle: '⟩', lVert: '‖', rVert: '‖', Vert: '‖',
  mid: '∣', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', circ: '∘', star: '⋆', ast: '∗', oplus: '⊕', otimes: '⊗',
  odot: '⊙', top: '⊤', perp: '⊥', emptyset: '∅', varnothing: '∅', neg: '¬', lnot: '¬', wedge: '∧', land: '∧', vee: '∨',
  lor: '∨', ell: 'ℓ', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', prime: '′', degree: '°', dagger: '†', ll: '≪', gg: '≫',
  coloneqq: '≔', triangleq: '≜', dashv: '⊣', vdash: '⊢', models: '⊨', bullet: '•', setminus: '∖', smallsetminus: '∖',
  lesssim: '≲', gtrsim: '≳', preceq: '⪯', succeq: '⪰', angle: '∠', square: '□', checkmark: '✓', sqrt: '√',
};
const FUNCS = ['log', 'ln', 'exp', 'max', 'min', 'arg', 'sin', 'cos', 'tan', 'lim', 'sup', 'inf', 'det', 'dim', 'mod', 'Pr', 'tr', 'softmax', 'argmax', 'argmin', 'KL', 'var', 'Var', 'Cov', 'diag', 'sgn', 'rank'];
const SPACE: Record<string, string> = { quad: '  ', qquad: '    ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ' };
const BB: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', E: '𝔼', P: 'ℙ', H: 'ℍ', '1': '𝟙' };
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻',
  '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', T: 'ᵀ', t: 'ᵗ', k: 'ᵏ', d: 'ᵈ', j: 'ʲ', m: 'ᵐ', x: 'ˣ', a: 'ᵃ', b: 'ᵇ',
  c: 'ᶜ', e: 'ᵉ', l: 'ˡ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', y: 'ʸ', z: 'ᶻ', '*': '*', '′': '′', "'": '′', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'φ': 'ᵠ', 'χ': 'ᵡ',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋',
  '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ',
  r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', 'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'φ': 'ᵩ', 'χ': 'ᵪ', ',': ',',
};
const ACCENT: Record<string, string> = { hat: '̂', widehat: '̂', bar: '̄', overline: '̄', tilde: '̃', widetilde: '̃', vec: '⃗', dot: '̇', ddot: '̈' };

function readGroup(s: string, i: number): [string, number] {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    let depth = 1, j = i + 1;
    while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
    return [s.slice(i + 1, j - 1), j];
  }
  if (s[i] === '\\') {
    const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
    if (m) return [m[0], i + m[0].length];
  }
  return [s[i] ?? '', i + 1];
}

function script(body: string, map: Record<string, string>): string | null {
  const conv = convert(body);
  if (conv === null) return null;
  let out = '';
  for (const ch of conv.replace(/\s+/g, '')) {
    const m = map[ch];
    if (!m) return null;
    out += m;
  }
  return out;
}

function convert(tex: string): string | null {
  let out = '';
  let i = 0;
  const s = tex;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (!m) return null;
      const name = m[1];
      i += m[0].length;
      if (name in SPACE) { out += SPACE[name]; continue; }
      if (name === '{' || name === '}' || name === '%' || name === '$' || name === '#' || name === '&' || name === '_') { out += name; continue; }
      if (name === '|') { out += '‖'; continue; }
      if (name === 'left' || name === 'right' || name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg' || name === 'displaystyle' || name === 'textstyle' || name === 'limits' || name === 'nolimits') {
        if ((name === 'left' || name === 'right') && s[i] === '.') i++;
        continue;
      }
      if (name in SYM && name !== 'sqrt') { out += SYM[name]; continue; }
      if (FUNCS.includes(name)) { out += name; continue; }
      if (name === 'mathbb') { const [g, j] = readGroup(s, i); i = j; out += [...g].map((c) => BB[c] || c).join(''); continue; }
      if (name === 'mathcal' || name === 'mathscr') {
        const [g, j] = readGroup(s, i); i = j;
        out += [...g].map((c) => (/[A-Z]/.test(c) ? ({ B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ' } as Record<string, string>)[c] || String.fromCodePoint(0x1d49c + c.charCodeAt(0) - 65) : c)).join('');
        continue;
      }
      if (['mathbf', 'mathrm', 'mathit', 'text', 'textbf', 'textit', 'mathsf', 'operatorname', 'boldsymbol', 'bm', 'mbox', 'emph', 'textrm', 'mathtt'].includes(name)) {
        const [g, j] = readGroup(s, i); i = j;
        const c = name.startsWith('text') || name === 'mbox' ? g : convert(g);
        if (c === null) return null;
        out += c;
        continue;
      }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [a, j] = readGroup(s, i);
        const [b, k] = readGroup(s, j);
        i = k;
        const ca = convert(a), cb = convert(b);
        if (ca === null || cb === null) return null;
        const wrap = (x: string) => (/^[\wͰ-Ͽ′]+$/u.test(x) || x.length <= 1 ? x : `(${x})`);
        out += `${wrap(ca)}/${wrap(cb)}`;
        continue;
      }
      if (name === 'sqrt') {
        if (s[i] === '[') return null;
        const [g, j] = readGroup(s, i); i = j;
        const c = convert(g);
        if (c === null) return null;
        out += c.length <= 2 ? `√${c}` : `√(${c})`;
        continue;
      }
      if (name in ACCENT) {
        const [g, j] = readGroup(s, i); i = j;
        const c = convert(g);
        if (c === null || [...c].length !== 1) return null;
        out += c + ACCENT[name];
        continue;
      }
      return null;
    }
    if (ch === '^' || ch === '_') {
      const [g, j] = readGroup(s, i + 1);
      i = j;
      const conv = script(g, ch === '^' ? SUP : SUB);
      if (conv === null) {
        const plain = convert(g);
        if (plain === null || plain.length > 6) return null;
        out += ch === '^' ? `^(${plain})` : `_(${plain})`;
      } else out += conv;
      continue;
    }
    if (ch === '{' || ch === '}') { i++; continue; }
    if (ch === '~') { out += ' '; i++; continue; }
    if (ch === '-') { out += '−'; i++; continue; }
    out += ch;
    i++;
  }
  return out;
}

/** Unicode rendering of a simple formula, or null when KaTeX is needed. */
export function texToUnicode(tex: string): string | null {
  if (tex.length > 90 || /\\(begin|matrix|cases|array|overset|underset|stackrel|substack|xrightarrow|binom|choose|pmatrix|bmatrix|align)/.test(tex)) return null;
  const r = convert(tex.trim());
  if (r === null) return null;
  if (/[\\{}]/.test(r)) return null;
  return r.replace(/\s{2,}/g, ' ');
}

/* ---------- KaTeX ---------- */

let katexP: Promise<any> | null = null;
function katex() {
  if (!katexP) {
    katexP = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(async ([k]) => {
      try { await Promise.all(['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2'].map((f) => document.fonts.load(`20px ${f}`))); } catch { /* fonts optional */ }
      return k.default;
    });
  }
  return katexP;
}

let measureHost: HTMLDivElement | null = null;
const cache = new Map<string, { html: string; w: number; h: number; depth: number }>();

/** Typesets a formula and measures it (CSS px at the given font size). Cached. */
export async function typeset(tex: string, display: boolean, size: number): Promise<{ html: string; w: number; h: number; depth: number }> {
  const key = `${display ? 'D' : 'I'}|${size}|${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const k = await katex();
  const html = k.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore', trust: false });
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap';
    document.body.append(measureHost);
  }
  const box = document.createElement('span');
  box.style.cssText = `display:inline-block;font-size:${size}px;line-height:1`;
  box.className = display ? 'hw-math-display' : 'hw-math-inline';
  box.innerHTML = html;
  measureHost.append(box);
  const r = box.getBoundingClientRect();
  const base = box.querySelector('.katex-html .base') as HTMLElement | null;
  const depth = base ? r.bottom - base.getBoundingClientRect().bottom : 0;
  box.remove();
  const res = { html, w: Math.ceil(r.width) + 2, h: Math.ceil(r.height), depth: Math.max(0, depth) };
  cache.set(key, res);
  return res;
}
