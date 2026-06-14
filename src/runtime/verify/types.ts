import type { SemanticState } from "../semantic/extractSemanticState.js";

export type VerifyCheck =
  | {
      type: "primary_cta";
      expectedText?: string;
      mustBeEnabled?: boolean;
    }
  | {
      type: "no_errors";
    }
  | {
      type: "loaded";
      timeoutMs?: number;
    }
  | {
      type: "route";
      expected: string;
    }
  | {
      type: "modal_open";
      expectedTitle?: string;
    }
  | {
      type: "modal_closed";
    }
  | {
      type: "heading_present";
      text: string;
    }
  | {
      type: "input_count";
      min?: number;
      max?: number;
      exact?: number;
    }
  | {
      type: "computed_style";
      selector: string;
      prop: string;
      expected: string;
    }
  | {
      type: "class_present";
      selector: string;
      className: string;
    }
  | {
      type: "class_absent";
      selector: string;
      className: string;
    }
  | {
      type: "figma_spec";
      spec: FigmaSpec | string;
    };

export type FigmaState = "rest" | "hover" | "focus" | "active";

export interface FigmaTypography {
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  fontFamily?: string;
}

export interface FigmaTarget {
  selector: string;
  state?: FigmaState;
  typography?: FigmaTypography;
  style?: Record<string, string>;
  tokens?: string[];
}

export type FigmaCategory = "color" | "border" | "typography" | "spacing";

export interface FigmaSpec {
  name?: string;
  figmaUrl?: string;
  targets: FigmaTarget[];
  cssVariables?: string[];
  strict?: boolean;
  skipCategories?: FigmaCategory[];
}

export interface CheckResult {
  type: VerifyCheck["type"];
  ok: boolean;
  message?: string;
  observed?: unknown;
}

export interface VerifyResult {
  ok: boolean;
  checks: CheckResult[];
  state: SemanticState;
  elapsedMs: number;
}
