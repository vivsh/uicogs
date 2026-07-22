import { resource, type ResourceDefinitionIdentity, type UiCogs } from "./resource.js";
export { schema as defineSchema } from "./schema.js";

export function registerResource<TContext>(runtime: UiCogs<TContext>): typeof resource {
  return ((options: never) => {
    const definition = resource(options);
    const registry = runtime as unknown as {
      registerDefinition(value: ResourceDefinitionIdentity): void;
    };
    registry.registerDefinition(definition);
    return definition;
  }) as typeof resource;
}
