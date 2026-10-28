// Shared shapes of the desk scene: what an object module is given (ObjCtx) and what it gives back (DeskObject).
export type V3 = [number, number, number];
export type Box3 = [V3, V3];

/** Where an object's own frame sits on the desk: its origin (u along the front edge, v toward the student) and turn. */
export interface Placement { u: number; v: number; rot: number }

export interface ChoiceDef { label: string; onClick: (st: any, ui: ObjUI) => void; current?: boolean; disabled?: boolean; why?: string }
export interface ButtonDef { label: string; onClick?: (st: any, ui: ObjUI) => void; choices?: (st: any) => ChoiceDef[] }
export interface StatDef { label: string; value: string; small?: boolean }
export interface LabelItem { at: V3; text: string; on?: boolean }

/** The ui surface a figure uses (it used to be mountFigure's). */
export interface ObjUI {
  st: any;
  animate(step: (dt: number) => boolean | void): void;
  invalidate(): void;
  render(): void;
  flash(text: string, ms?: number): void;
}

/** One render of an object: flat marks under everything, its shadows, its body, and its part labels. */
export interface Rendered { ground: string; shadow: string; body: string; labels: LabelItem[]; box: Box3; /** the box in the object's own (unmoved) coordinates */ localBox?: Box3 }

export interface DeskObject {
  n: string;
  id: string;
  title: string;
  st: any;
  seeThrough: boolean;
  buttons: ButtonDef[];
  acts: Record<string, (st: any, el: Element, ui: ObjUI) => void>;
  ui: ObjUI;
  stats(): StatDef[];
  render(): Rendered;
}

export interface DeskKit {
  DK: number[]; DU: V3; DV: V3;
  dk(u: number, v: number, z?: number): V3;
  dkv(u: number, v: number, z?: number): V3;
  undk(p: V3): V3;
  [k: string]: any;
}

/** A shared paper's own frame: (pu, pv) from its top-left corner, pu across the page, pv down it; z = its top. */
export interface PaperKit extends DeskKit { w: number; h: number; z: number; thick: number }

export interface ObjCtx {
  desk: DeskKit;
  deskZ: number;
  floorZ: number;
  /** a shared paper ('S1' 数学试卷, 'S2' 数学练习, 'S3' 一摞试卷, 'S4' 英语默写, 'blank' the reading spot) */
  paper(id: string): PaperKit;
  /** the classmate's jacket on the chair beyond the far edge (desk coords): its outer face is the plane v = face */
  jacket: { u0: number; u1: number; v: number; face: number; z0: number; z1: number };
  /** is a world point over the desk top (things that slide or fly off it fall to the floor) */
  onDesk(p: V3): boolean;
  /** the scene's clock, ms */
  now(): number;
  /** Wake this object once after ms, while the desk is being looked at (home, tab visible): run fn (start an
   *  animation, say), or with no fn just redraw it. A later call with the same key replaces the earlier one. Call it
   *  from render for things that change with real time (a clock's next minute); nothing runs while nobody looks.
   *  `ambient`: only a touch of life (the fish's swim), so it also waits while nobody is at the desk (the window in
   *  the background, or nothing touched for a minute). */
  later(ms: number, fn?: () => void, key?: string, ambient?: boolean): void;
  ui: ObjUI;
  play: { kPlay: (...a: any[]) => void; kBusy: () => string | null };
  castShadow: (pts: V3[], z0?: number, clip?: unknown) => string;
  clipTo: (pts: V3[], inner: string) => string;
  labels: (items: LabelItem[], B: number[]) => string;
  adapt: (cfg: any, opts: { seeThrough: boolean }) => DeskObject;
}

export type ObjectFactory = (ctx: ObjCtx) => DeskObject;
