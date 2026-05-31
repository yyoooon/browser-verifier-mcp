export interface CaptureOptions {
    name?: string;
    fullPage?: boolean;
    format?: "jpeg" | "png";
    quality?: number;
}
export interface CaptureResult {
    ok: true;
    path: string;
    bytes: number;
    format: "jpeg" | "png";
    elapsedMs: number;
}
export declare function captureScreenshot(opts?: CaptureOptions): Promise<CaptureResult>;
