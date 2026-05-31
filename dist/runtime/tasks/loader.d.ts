import type { TasksFile } from "./types.js";
export interface LoadResult {
    tasks: TasksFile;
    warnings: string[];
    path: string;
}
export declare function loadTasksFromFile(path: string): LoadResult;
export declare function validateTasksFile(data: unknown): {
    tasks: TasksFile;
    warnings: string[];
};
