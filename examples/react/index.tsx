import {
  createUiCogs,
  fields,
  operation,
  resource,
  schema,
  useCollection,
  useObject,
} from "@uicogs/react";
import { createElement, useEffect, useMemo } from "react";

export const Task = schema({
  id: fields.ID(),
  title: fields.Text({ required: true }),
});

export const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list(),
    retrieve: operation.retrieve(),
  },
});

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
});

export function TaskList(): React.JSX.Element {
  const controller = useMemo(() => api.resource(Tasks), []);
  const tasks = useCollection(controller);

  useEffect(() => {
    void controller.load();
    return () => controller.cancel();
  }, [controller]);

  return createElement(
    "ul",
    undefined,
    tasks.all().map((task) => createElement("li", { key: task.id }, task.title)),
  );
}

export function TaskDetail({ taskId }: { readonly taskId: number }): React.JSX.Element {
  const resourceController = useMemo(() => api.resource(Tasks), []);
  const objectController = useMemo(
    () => resourceController.get(taskId),
    [resourceController, taskId],
  );
  const task = useObject(objectController);

  useEffect(() => {
    void objectController.load();
    return () => objectController.cancel();
  }, [objectController]);

  return createElement("article", undefined, task.value?.title ?? "Loading");
}
