import type { FigmaTokenBinding } from "../types.js";
export interface TokenPartition {
    classNames: string[];
    swatches: FigmaTokenBinding[];
}
export declare function partitionTokens(tokens: Array<string | FigmaTokenBinding> | undefined): TokenPartition;
