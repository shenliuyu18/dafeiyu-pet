// 前端与 Wails 绑定的契约说明。运行时不参与打包，仅作为开发时的类型参考。
export interface LedgerRow {
  label: string;
  value: string;
}

export interface Ledger {
  source: string;              // qoder / deepseek / moonshot / siliconflow / doubao / openai / claude
  available: boolean;
  rows?: LedgerRow[];
  providerLabel?: string;
  providerShort?: string;
  error?: string;
  errorCode?: string;
  errorHint?: string;
  httpStatus?: number;
  latencyMs?: number;
  keySource?: 'saved' | 'legacy' | 'env' | '';
  today?: number;
  month?: number;
  session?: number;
  quota?: number;
  percent?: number | null;
  updatedAt?: number;
  lastOkAt?: number;
  pending?: boolean;
}

export interface PomoDay {
  date: string;
  label: string;
  weekday: string;
  minutes: number;
  today: boolean;
}

export interface PomoStats {
  today: number;
  week: number;
  total: number;
  days: PomoDay[];
}

export interface FullscreenEntry {
  t: string;
  active: boolean;
  signal: string;
  quns?: number | null;
  class: string;
  rect: string;
  action: string;
  petHidden: boolean;
  fsHidden: boolean;
}

export interface FullscreenDiagnostics {
  enabled: boolean;
  active: boolean;
  signal: string;
  hidden: boolean;
  fsHidden: boolean;
  hits: number;
  clears: number;
  confirmTicks: number;
  clearTicks: number;
  restoreDelayMs: number;
  rehideDelayMs: number;
  entries: FullscreenEntry[];
}

export interface InitPayload {
  satiety: number;
  mood: number;
  awake: boolean;
  ledger: Ledger | null;
  settings: Record<string, unknown> & {
    character?: string;
    fontFamily?: string;
    fontSize?: number;
    sfx?: string;
    lang?: string;
    autoActionSec?: number;
    ledgerSource?: string;
    dock?: string;
    scale?: number;
    pomoMin?: number;
    pomoAnimSec?: number;
    fullscreenHide?: boolean;
    autoUpdate?: boolean;
    customQuips?: string[];
    useCustomQuips?: boolean;
    pinnedActions?: Record<string, string[]>;
  };
  version?: string;
  appName?: string;
  pos?: { x: number; y: number };
  pomodoro?: { running: boolean; rest?: boolean; remainMs?: number; totalMs?: number };
  apiKeys?: Record<string, boolean>;
}

export interface PetApi {
  platform: 'wails';
  ready(): void;
  reportPos(pos: { x: number; y: number; s: number; force?: boolean; bubble?: boolean }): Promise<void> | void;
  logFrontend(level: 'error' | 'warn' | 'info', msg: string): Promise<void>;
  setPanel(open: boolean): Promise<void>;
  setDragging(on: boolean): void;
  setFocusable(on: boolean): void;
  updateStats(stats: { satiety: number; mood: number }): void;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  pickApp(): Promise<string | null>;
  importFont(): Promise<string | null>;
  autostartStatus(): Promise<{ enabled: boolean; task?: boolean }>;
  checkUpdate(): Promise<Record<string, unknown>>;
  downloadUpdate(mode: 'direct' | 'accel'): Promise<Record<string, unknown>>;
  installUpdate(): Promise<Record<string, unknown>>;
  keyOpen(provider: string): void;
  keyInfo(provider: string): Promise<{ label: string; hint: string; hasKey: boolean }>;
  keySave(provider: string, key: string): Promise<{ ok: boolean; error?: string }>;
  keyCheck(provider: string, key: string): Promise<{ ok: boolean; errorCode?: string; error?: string; errorHint?: string; latencyMs?: number }>;
  keyClear(provider: string): Promise<{ ok: boolean }>;
  refreshUsage(): Promise<Ledger>;
  fullscreenDiagnostics(): Promise<FullscreenDiagnostics>;
  exportDiagnostics(): Promise<{ ok: boolean; path?: string; size?: number; error?: string }>;
  pomoStats(): Promise<PomoStats>;
  editWords(): void;
  wordsInfo(): Promise<{ lines: string[]; use: boolean; maxLines: number; maxLen: number }>;
  wordsSave(lines: string[]): Promise<{ ok: boolean; count?: number; error?: string }>;
  closeOverlays(): void;
  openExternal(url: string): void;
  action(name: string): void;
  notify(text: string): void;
  quit(): void;
  on(name: string, fn: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    pet?: PetApi;
    PetLib?: {
      motion: {
        clamp(v: number, lo: number, hi: number): number;
        wanderSpeed(satiety: number): number;
        pickTarget(
          b: { minX: number; maxX: number; minY: number; maxY: number },
          mouse: { x: number; y: number },
          cx: number,
          cy: number,
          rng?: () => number,
        ): { x: number; y: number };
        steer(p: { x: number; y: number; vx: number; vy: number }, tx: number, ty: number, speed: number, dt: number): number;
        coast(p: { x: number; y: number; vx: number; vy: number }, dt: number, damp: number): void;
      };
      memeQueue: {
        MemeQueue: new (rng?: () => number) => {
          next<T extends { file: string }>(scene: string, build: () => T[]): T | null;
          reset(): void;
          last: string;
        };
        shuffle<T>(list: T[], rng?: () => number): T[];
      };
      format: {
        compareVersion(a: string, b: string): number;
        isNewer(a: string, b: string): boolean;
      };
      i18n: {
        apply(lang: string): void;
        line(text: string, lang: string): string;
        T(text: string, vars?: Record<string, string | number>): string;
        translate(text: string, lang: string): string;
        extend(en: Record<string, string>, ja: Record<string, string>): void;
        extendUI(en: Record<string, string>, ja: Record<string, string>): void;
        dictionaries: Record<string, Record<string, string>>;
      };
      anim: {
        baseKind(s: {
          dragging: boolean;
          awake: boolean;
          autoDoze: boolean;
          pomoRunning: boolean;
          pomoResting: boolean;
          satiety: number;
          swimming: boolean;
        }): 'drag' | 'sleep' | 'pomo' | 'idle' | 'sad' | 'move';
      };
      bubble: {
        shouldFlipDown(petY: number, bubbleH: number, scale: number): boolean;
        edgeShift(rect: { left: number; right: number }, viewportWidth: number, margin?: number): number;
        topShift(rect: { top: number }, margin?: number): number;
      };
      frameSchedule: {
        gapLimit(s: { dragging: boolean; vx: number; vy: number; idleGap: number; roamGap: number }): number;
        shouldReportPosition(
          now: number, lastPosAt: number, lastReportAt: number,
          x: number, y: number, lastX: number, lastY: number,
        ): boolean;
        BUSY_SPEED: number;
      };
      animActions: {
        ANIM_BUILTIN: Record<string, string[]>;
        PLUS_TARGET: Record<string, string>;
        CODE_CHAR_PACKS: Record<string, string>;
      };
      memePool: {
        classicMeme(name: string, text: string, baseUrl: string): { file: string; url: string; text: string };
        mergeByFile<T extends { file: string }>(a: T[], b: T[]): T[];
      };
      petRect: {
        visibleRect(x: number, y: number, scale: number, box: { x0: number; x1: number; y0: number; y1: number }): {
          left: number; right: number; top: number; bottom: number;
        };
      };
      timeFormat: {
        clock(ms: number): string;
        minutes(v: number): string;
      };
      ledgerFormat: {
        KEY_SOURCE_LABEL: Record<string, string>;
        ledgerDiagText(l: Ledger | null): string;
      };
      settingsUi: {
        saveSettings(): void;
        syncSettingsUI(): void;
        applyLedgerUI(): void;
      };
      dialogue: {
        QUIPS: string[];
        GPT_QUIPS: string[];
        MEMES: Record<string, string[]>;
        CLASSIC_MEME_TEXTS: Record<string, string>;
        FEED_LINES: string[];
        HUNGRY_LINES: string[];
        SLEEP_LINES: string[];
        AI_FEED_LINES: string[];
        AI_HUNGRY_LINES: string[];
        AI_SLEEP_LINES: string[];
        CHAR_LINES: Record<string, {
          intro?: string;
          quips?: string[];
          feed?: string[];
          hungry?: string[];
          sleep?: string[];
        }>;
      };
    };
  }
}