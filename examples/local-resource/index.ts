import { createUiCogs, fields, local, resource, schema } from "@uicogs/core";

export const Selection = schema({
  id: fields.ID(),
  label: fields.Str({ required: true }),
});

export const Selections = resource({
  name: "selections",
  schema: Selection,
  key: "id",
  source: local({
    initial: [{ id: 1, label: "Initial" }],
    generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
  }),
});

export const api = createUiCogs({ resources: [Selections] });

const pageSelection = api.resource(Selections);
const sidebarSelection = api.resource(Selections);
const selected = sidebarSelection.get(1);

const unsubscribe = selected.subscribe(() => {
  console.log(selected.value?.label);
});

pageSelection.cache.upsert({ id: 1, label: "Updated" });
pageSelection.cache.add({ id: 2, label: "Added" });

console.log(pageSelection.all());
console.log(sidebarSelection.all());

unsubscribe();
api.dispose();
