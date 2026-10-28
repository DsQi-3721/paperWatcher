import type { Box3, V3 } from './types';
export interface PileMeta { id: string; pages?: number; title?: string; openedAt?: number; addedAt: number }
export interface PileSpot { u: number; v: number; turn: number; floor: boolean }
export interface PileItem { meta: PileMeta; z0: number; deg: number; du: number; dv: number; tint: string }
export interface PilePlan { spot: PileSpot; /** which spot (PILE_SPOTS index) */ i: number; items: PileItem[] }
export declare const SHEET: { w: number; h: number };
export declare function planPiles(papers: PileMeta[], spots?: PileSpot[]): PilePlan[];
export declare function pileRender(p: PilePlan, opts: { hidden?: string; thumb(m: PileMeta): string | undefined; /** screen px per drawing unit */ px?: number }): { body: string; shadow: string; floor: boolean; box: Box3 } | null;
export declare function paperTop(piles: PilePlan[], id: string): V3[] | null;
