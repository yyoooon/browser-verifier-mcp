export interface CDPTarget {
    id: string;
    url: string;
    title: string;
    type: string;
    webSocketDebuggerUrl: string;
}
export declare function listTargets(cdpUrl?: string): Promise<CDPTarget[]>;
export declare function findTargetByPort(devPort: number, cdpUrl?: string): Promise<CDPTarget | null>;
