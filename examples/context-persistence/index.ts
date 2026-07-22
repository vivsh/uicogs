import { createUiCogs } from "@uicogs/core";
import { storage } from "@uicogs/storage";

export const api = createUiCogs({
  context: {
    locale: "en",
    timeZone: "UTC",
    compact: false,
  },
  persistence: {
    backend: storage.local({ namespace: "application" }),
  },
});

api.context.update({ compact: true });

console.log(api.context.value);
