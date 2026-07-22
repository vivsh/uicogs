import { createUiCogs, fields, operation, resource, schema } from "@uicogs/core";

export const Task = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
  complete: fields.Bool({ required: true, default: false }),
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
  context: { locale: "en" },
});

const incompleteTasks = api.resource(Tasks).filter({ complete: false });

await incompleteTasks.load();

for (const task of incompleteTasks.all()) {
  console.log(task.id, task.title);
}
