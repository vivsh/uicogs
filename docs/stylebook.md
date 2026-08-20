# Quasar Stylebook

`@uicogs/quasar/stylebook` provides an opt-in, local-fixture route for visually
reviewing UiCogs and default Quasar states. It is a development tool, not an
application shell or data layer: it never creates a UiCogs runtime, loads a resource,
makes a request, persists data, opens a live connection, or changes application state.

The built-in overview follows the application-review structure used by UiCogs examples:
palette, typography, controls, cards and lists, feedback, schema-generated forms (including
multi-select, radio-group, date-range, and rich-text editors), filters (collapsed and
expanded), tables, notifications, and fixture-only pie, bar, and line charts.

## Install it only in development

Load the subpath dynamically so production builds do not include the stylebook chunk:

```ts
import { withVue } from "@uicogs/vue";

const stylebookIntegration = import.meta.env.DEV
  ? (await import("@uicogs/quasar/stylebook")).stylebook({
      path: "/__stylebook",
      components: [
        {
          id: "billing",
          label: "Billing fixtures",
          component: BillingFixtures,
          fixture: { invoices: [{ id: "invoice-1", total: 42 }] },
        },
      ],
    })
  : undefined;

export const { uiCogs } = await withVue(api, {
  navigation,
  stylebook: stylebookIntegration,
});

app.use(router).use(uiCogs);
```

`stylebook()` defaults to enabled and to `/__stylebook`; pass `enabled: false` for an
explicit no-op. Vue Router must still be installed before `uiCogs`, exactly as it is for
the normal UiCogs integration.

The integration registers one static route: `/__stylebook/:component?`. The base route
shows the built-in overview. Each custom entry receives one URL-safe segment; `overview`
is reserved. Invalid paths, duplicate entry IDs, and existing route conflicts throw at
plugin installation rather than silently replacing an application route.

Each custom entry may declare a generic `fixture` value. UiCogs passes it to that entry
as the component's `fixture` prop, so a page can receive typed local sample records
without importing the application's UiCogs runtime or data services.

## Fixtures and styling boundary

The overview owns small local form, filter, table, notification, chart, error-page, and rich-choice
fixtures.
Charts use static series through `UcEChart`; no resource or transport is involved.
Custom pages receive the same restriction: keep them deterministic and local. Do not
connect application resources, services, storage, notifications, or live effects.

For that reason, the built-in resource-view fixture does not demonstrate a route-backed
resource page. In an application page, the preferred routed pattern is
`<UcResourceView :route-resource="page" />`, where `page` comes from
`useRouteResource()`; see [Routing](routing.md#shareable-list-and-detail-state). This
keeps the stylebook fixture-only while documenting the production integration.

The stylebook owns a small, isolated documentation stylesheet. It gives the page itself a
clear hierarchy—navigation, hero, section dividers, and responsive structure—through its
own stable hooks. It never targets or restyles a presented Quasar or UiCogs component: forms,
filters, tables, cards, notifications, charts, and fields retain their ordinary application
appearance. It also never targets Quasar-generated internals. The overview has a sticky desktop
index, anchored sections, and a responsive mobile preview. Its toolbar switches between
light/dark previews through Quasar's public dark-mode API and restores the application's
original theme when the route unmounts.

The stable hooks are:

```text
uc-stylebook
uc-stylebook__navigation
uc-stylebook__navigation-title
uc-stylebook__navigation-item
uc-stylebook__index
uc-stylebook__index-item
uc-stylebook__controls
uc-stylebook__content
uc-stylebook__entry
uc-stylebook__hero
uc-stylebook__section
uc-stylebook__surface
uc-stylebook__chart-card
uc-stylebook__not-found
```

Use the same public UiCogs skins, Quasar configuration, and application styles that
your product uses. Do not target Quasar-generated internals. The mobile control is a
layout preview, not browser-device emulation; validate touch and device behavior with a
real mobile viewport as well.
