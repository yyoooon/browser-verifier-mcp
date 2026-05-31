import type { TaskDefinition, TasksFile } from "./types.js";

let registry: TasksFile = {};
let sourcePath: string | null = null;

export function setTasks(tasks: TasksFile, path: string | null): void {
  registry = tasks;
  sourcePath = path;
}

export function getTasks(): TasksFile {
  return registry;
}

export function getTask(name: string): TaskDefinition | undefined {
  return registry[name];
}

export function getSourcePath(): string | null {
  return sourcePath;
}
