import { bindUiCogs, createUiCogs, fields, operation, resource, schema } from "@uicogs/vue";

export const Project = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});

export const Projects = resource({
  name: "projects",
  url: "projects/",
  schema: Project,
  key: "id",
  operations: {
    retrieve: operation.retrieve(),
  },
});

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Projects],
  context: { locale: "en" },
});

export const { UiCogsPlugin, useUiCogs } = bindUiCogs(api);

export const project = api.resource(Projects).get(1);

void project.load();
