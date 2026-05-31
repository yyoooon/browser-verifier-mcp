import type { Page } from "playwright-core";
export interface SemanticModal {
    title: string;
    visible: boolean;
}
export interface SemanticCTA {
    text: string;
    visible: boolean;
    enabled: boolean;
}
export interface SemanticFocused {
    tag: string;
    text: string;
}
export interface SemanticState {
    route: string;
    search: string;
    hash: string;
    title: string;
    loading: boolean;
    loadingHints: string[];
    modal: SemanticModal | null;
    primaryCTA: SemanticCTA | null;
    headings: string[];
    errors: string[];
    inputCount: number;
    focusedElement: SemanticFocused | null;
    elapsedMs: number;
}
export declare function extractSemanticState(page: Page): Promise<SemanticState>;
