// Types for the parts of the drawing engine (core.js + kit.js) that TypeScript code calls. The object modules and
// props are plain JS and use everything else.
import type { V3 } from '../types';

type Pal = { l: string; m: string; d: string };
type Pt = [number, number];

export declare let YAW: number;
export declare let PITCH: number;
export declare let CAM_V: V3;
export declare let CAM_R: V3;
export declare let CAM_U: V3;
export declare let INK_K: number;
export declare let OX: number;
export declare let OY: number;
export declare let RC: number[];
export declare let RCZ: number;
export declare let SH: number[];
export declare const SHADOW_K: number;
export declare const SHADOW_LEN: number;
export declare function yawTurn(v: number[]): [number, number];
export declare const CAM_K: number;
export declare const YAW0: number;
export declare const PITCH0: number;
export declare const C: number;
export declare const S: number;
export declare const INK: string;
export declare const SHADOW: string;
export declare const PALS: Record<string, Pal>;
export declare const MAT: Record<string, Pal>;
export declare const DESK_Z: number;

export declare function setCam(yaw: number, pitch: number): void;
export declare function setLight(deg: number): void;
export declare function setInk(k: number): void;
export declare let LOD: number;
export declare let PREC: number;
export declare let TEXT_MIN: number;
export declare function setTextMin(k: number): void;
export declare function setPrec(k: number): void;
export declare function setLod(k: number): void;
export declare function setOrigin(ox: number, oy: number, rc?: [number, number], rcz?: number): void;
export declare function setClipPrefix(p: string): void;
export declare function setRec(r: [V3, V3] | null, zmin?: number, skip?: ((p: V3) => boolean) | null): void;
export declare function P(x: number, y: number, z: number): Pt;
export declare function Dv(x: number, y: number, z: number): Pt;
export declare function pd(pts: V3[], close?: boolean): string;
export declare function castShadow(pts: V3[], z0?: number, clip?: V3[] | null): string;
export declare function clipTo(pts3: V3[], inner: string): string;
export declare function byDepth(parts: Array<{ at?: V3; box?: [V3, V3]; svg: string } | null | undefined | false>): string;
export declare function depthOf(p: V3): number;
export declare function inkScale(svg: string): string;
export declare function mergeLines(svg: string): string;
export declare function filterFor(k: number): string;
export declare function ease(t: number): number;
export declare function mix(a: string, b: string, t: number): string;
export declare function vis(n: V3): boolean;
export declare function makeDesk(u0?: number, v0?: number, rot?: number): any;
export declare function makePlayer(ui: any): { kPlay: (...a: any[]) => void; kBusy: () => string | null };
