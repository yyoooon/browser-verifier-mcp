let registry = {};
let sourcePath = null;
export function setTasks(tasks, path) {
    registry = tasks;
    sourcePath = path;
}
export function getTasks() {
    return registry;
}
export function getTask(name) {
    return registry[name];
}
export function getSourcePath() {
    return sourcePath;
}
//# sourceMappingURL=registry.js.map