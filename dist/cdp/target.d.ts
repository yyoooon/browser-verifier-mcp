export interface CDPTarget {
    id: string;
    url: string;
    title: string;
    type: string;
    webSocketDebuggerUrl: string;
}
export declare function listTargets(): Promise<CDPTarget[]>;
export declare function findTargetByPort(devPort: number): Promise<CDPTarget | null>;
