# Books (读物): novels, comics, magazines on the desk's textbook

The 语文 textbook on the desk is the reading shelf. Clicking it fans out the imported books (like the paper piles);
picking one opens it in the book reader over the blurred desk. The textbook keeps its thickness; it only takes the
look of the book read last (its cover on the cover, its colour on the boards).

## Pieces and who owns them
| | file(s) | does |
|---|---|---|
| contract | `types.ts` | `BookMeta` (server-side record), `BookDoc` = `FlowDoc` (reflowable) / `FixedDoc` (pages), `BookSettings`, `ReaderHost` |
| formats | `formats/**` | `detectFormat`, `parseBook`, `coverFor`, `lengthOf`, `BOOK_ACCEPT`: EPUB, MOBI/AZW3, TXT, PDF, CBZ, FB2, HTML, MD → `BookDoc` |
| reader | `reader/**`, `src/styles/books.css` | `BookReader`: pretext page layout, rendering, settings, contents, bookmarks, search, progress; fixed pages (comics/PDF) |
| app side | `server/books.ts`, `src/api.ts`, `src/ui/bookimport.ts`, the desk (`src/scene`), `src/app.ts` | storage, import (files, links, OPDS catalogs), the textbook's look, the fan, opening / closing a book, the reading light (`src/ui/ambience.ts`) |

## The document model (types.ts)
- `FlowDoc`: `chapters[]` of `blocks[]`. A block is a paragraph-like thing with `runs` (text with b / i / code / sup / sub
  / href / ruby), or an image (`src` = a key into `resources`, a `Map<string, Blob>`), or `hr`. `chapter.chars` = the
  characters in its runs: **positions are (chapter, character offset)**, so they survive any change of font, size or
  page width; `percent` = characters before / all characters.
- `FixedDoc`: `pages`, `size(i)` (`sizeOf(i)` reads one not known yet: PDFs measure pages as they are shown),
  `render(i, widthPx)` → a canvas / bitmap / image (the reader keeps the view and the pages either side of it, and
  gives the rest back at once); positions are (0, page index).
- `toc[]`: `{ title, chapter, block?, children? }`.
- Parsing happens in the browser (DOMParser, TextDecoder, pdf.js, fflate for zip). The server only stores the file.

## The reader's contract (ReaderHost)
`new BookReader(host, doc, meta, settings, cb)` then `open(at?)`; `pageRect()` (for the open / close move); `destroy()`
(it also lets go of a fixed doc: `FixedDoc.destroy()` may be called again, harmlessly).
It calls `cb.onProgress` when the page changes, `cb.onSettings` when a setting changes, `cb.onBookmarks`, and
`cb.onClose` for the back button / B / Esc with nothing open. The reading light and the immersive mode belong to the
app (`cb.ambience`): put `cb.ambience.panel()` in the settings, and use `setImmersive` for the middle-tap / F.
Chrome that should tuck into an edge in immersive mode carries `data-edge="top|bottom|left|right"`; open side panels
carry class `bk-panel on` (they keep the tools out). The reader handles its own keys while it is open.

## Dev
- `http://127.0.0.1:<port>/book-lab.html` — the reader alone: `?doc=novel|comic`, `?file=/tests/books/x.epub`,
  `?at=2:300`, any setting by name (`?size=22&theme=night&spread=double`). `window.lab = { reader, doc, log }`.
- Test books live in `tests/books/` (small, made or public-domain).
