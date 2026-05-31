import type { TaskDefinition, TasksFile } from "./types.js";
export declare function setTasks(tasks: TasksFile, path: string | null): void;
export declare function getTasks(): TasksFile;
export declare function getTask(name: string): TaskDefinition | undefined;
export declare function getSourcePath(): string | null;
