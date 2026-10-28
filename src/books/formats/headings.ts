// Chapter headings in plain text and in books that set them as ordinary lines: 第一章 / 第1章：… / 序章 / 番外 /
// Chapter 1 / CHAPTER I … A heading is short and does not end like a sentence.

const NUM = '[〇零一二三四五六七八九十百千万两廿卅0-9０-９]+';
const SEP = '[\\s\\u3000:：·.、．—\\-_]';
// 第一章 标题 · 第1章：标题 · 第十回 (with a separator, or nothing after)
const H_CN = new RegExp(`^(第\\s*${NUM}\\s*[章回节卷集部篇话幕折])(?:${SEP}+(.{0,40}))?$`);
// 第一章标题 (no separator; not 回 / 部, which start ordinary words: 回合, 部分)
const H_CN_TIGHT = new RegExp(`^(第\\s*${NUM}\\s*[章节卷集篇话幕])([^\\s\\u3000，。！？；、,.!?：:].{0,28})$`);
const H_SPECIAL = new RegExp(`^(序章|序言|序幕|序|楔子|引子|引言|前言|尾声|后记|後記|番外篇?|终章|終章|结局|大结局|附录|写在前面|作品相关|内容简介|简介|正文)(${SEP}+.{0,30}|[一二三四五六七八九十0-9]{1,3}(${SEP}+.{0,30})?)?$`);
const H_EN = /^(chapter|part|book|prologue|epilogue|interlude)(\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|twenty[- a-z]*))?\b[\s.:\-—]*.{0,60}$/i;
const SENTENCE_END = /[。！？…，；,;!?]$/;
export const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\u3040-\u30FF\uAC00-\uD7AF]/;

/** Is this line a chapter heading? (the line already trimmed) */
export function headingOf(line: string): string | null {
  if (!line || line.length > 50 || SENTENCE_END.test(line)) return null;
  if (H_CN.test(line) || H_CN_TIGHT.test(line) || H_SPECIAL.test(line)) return line.replace(/[\s\u3000]+/g, ' ');
  if (H_EN.test(line) && line.length <= 70 && !/[.!?]["”']?$/.test(line)) return line.replace(/\s+/g, ' ');
  return null;
}

