import { createFormController, editor, fields, schema } from "@uicogs/core";
import { useRoute, useRouter } from "vue-router";
import {
  QBanner,
  QBtn,
  QCard,
  QCardSection,
  QChip,
  QItem,
  QItemLabel,
  QItemSection,
  QList,
  QPage,
} from "quasar";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  ref,
  type PropType,
} from "vue";
import { UcFilter, UcForm, UcTable } from "./index.js";
import { quasarEditor } from "./editor-tools.js";
import { UcNotificationList } from "./notifications.js";
import { UcStylebookCharts } from "./stylebook-charts.js";
import type { UcStylebookEntry } from "./stylebook.js";

const filterSchema = schema({
  title: fields.Str({ required: true, label: "Title" }),
  status: fields.Enum(["open", "review", "done"] as const, { label: "Status" }),
  owner: fields.Str({ label: "Owner", layout: { filter: { placement: "collapsible" } } }),
});

const formSchema = schema({
  title: fields.Str({ required: true, label: "Title" }),
  status: fields.Enum(["open", "review", "done"] as const, { label: "Status" }),
  audience: fields.EnumList(["internal", "partners", "public"] as const, {
    label: "Audience",
    editor: editor.Select({ multiple: true, clearable: true }),
  }),
  visibility: fields.Enum(["draft", "review", "published"] as const, {
    label: "Visibility",
    editor: editor.RadioGroup({ inline: true }),
  }),
  reviewWindow: fields.DateRange({ label: "Review window", editor: editor.DateRange() }),
  notes: fields.RichText({
    label: "Notes",
    editor: quasarEditor.RichText({
      rows: 6,
      modes: ["edit", "source", "preview"],
      toolbar: [["bold", "italic", "underline", "undo", "redo"]],
    }),
  }),
});

const overviewIndex = Object.freeze([
  { id: "palette", label: "Palette" },
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "cards", label: "Cards and lists" },
  { id: "feedback", label: "Feedback" },
  { id: "forms", label: "Forms" },
  { id: "filters", label: "Filters" },
  { id: "table", label: "Table" },
  { id: "notifications", label: "Notifications" },
  { id: "charts", label: "Charts" },
]);

/** The route-level stylebook view; it owns only frozen local fixture data. */
export const UcStylebook = defineComponent({
  name: "UcStylebook",
  props: {
    entries: { type: Array as PropType<readonly UcStylebookEntry<unknown>[]>, required: true },
    routeName: { type: String, required: true },
  },
  setup(props) {
    const quasar = quasarForStylebook();
    const originalDark = quasar.dark.isActive;
    const dark = ref(originalDark);
    const mobile = ref(false);
    const route = useRoute();
    const router = useRouter();
    const requested = computed(() => route.params.component);
    const selected = computed(() =>
      typeof requested.value === "string" && requested.value !== "" ? requested.value : undefined,
    );
    const entry = computed(() =>
      props.entries.find((candidate) => candidate.id === selected.value),
    );
    const open = (id?: string): void => {
      void router.push({
        name: props.routeName,
        params: id === undefined ? {} : { component: id },
      });
    };
    const toggleDark = (): void => {
      dark.value = !dark.value;
      quasar.dark.set(dark.value);
    };
    onBeforeUnmount(() => quasar.dark.set(originalDark));
    return () =>
      h(
        QPage,
        { class: ["uc-stylebook", mobile.value ? "uc-stylebook--mobile" : undefined] },
        () => [
          h("nav", { class: "uc-stylebook__navigation", "aria-label": "Stylebook sections" }, [
            h("div", { class: "uc-stylebook__navigation-title" }, "UiCogs"),
            h(QList, { class: "uc-stylebook__navigation-pages" }, () => [
              pageItem("Overview", selected.value === undefined, () => open()),
              ...props.entries.map((candidate) =>
                pageItem(candidate.label ?? candidate.id, candidate.id === selected.value, () =>
                  open(candidate.id),
                ),
              ),
            ]),
            selected.value === undefined
              ? h("div", { class: "uc-stylebook__index" }, [
                  h("div", { class: "uc-stylebook__index-title" }, "On this page"),
                  h(QList, { dense: true }, () => overviewIndex.map(indexItem)),
                ])
              : undefined,
            h("div", { class: "uc-stylebook__controls", "aria-label": "Stylebook preview" }, [
              h(QBtn, {
                flat: true,
                dense: true,
                noCaps: true,
                label: dark.value ? "Light" : "Dark",
                "aria-label": dark.value ? "Use light preview" : "Use dark preview",
                "aria-pressed": dark.value,
                onClick: toggleDark,
              }),
              h(QBtn, {
                flat: true,
                dense: true,
                noCaps: true,
                label: mobile.value ? "Desktop" : "Mobile",
                "aria-label": mobile.value ? "Use desktop preview" : "Use mobile preview",
                "aria-pressed": mobile.value,
                onClick: () => (mobile.value = !mobile.value),
              }),
            ]),
          ]),
          h("div", { class: "uc-stylebook__content" }, [
            (() => {
              if (selected.value === undefined) return h(UcStylebookOverview);
              if (entry.value)
                return h(entry.value.component, {
                  key: entry.value.id,
                  ...(entry.value.fixture === undefined ? {} : { fixture: entry.value.fixture }),
                });
              return h(QBanner, { class: "uc-stylebook__not-found" }, () => [
                `No stylebook entry named \`${selected.value}\`.`,
                h(QBtn, { flat: true, label: "Back to overview", onClick: () => open() }),
              ]);
            })(),
          ]),
        ],
      );
  },
});

const UcStylebookOverview = defineComponent({
  name: "UcStylebookOverview",
  setup() {
    const form = createFormController(formSchema.toForm(), {
      title: "Draft",
      status: "open",
      audience: ["internal", "partners"],
      visibility: "review",
      reviewWindow: [new Date("2026-08-01T00:00:00.000Z"), new Date("2026-08-15T00:00:00.000Z")],
      notes: "<p>Use rich text where formatted, user-authored content is required.</p>",
    });
    const filters = createFormController(filterSchema.toForm(), { title: "", status: "open" });
    const expandedFilters = createFormController(filterSchema.toForm(), {
      title: "",
      status: "open",
      owner: "",
    });
    return () =>
      h("article", { class: "uc-stylebook__entry" }, [
        h("header", { class: "uc-stylebook__hero" }, [
          h("div", { class: "uc-stylebook__eyebrow" }, "Component reference"),
          h("h1", {}, "UiCogs Quasar stylebook"),
          h("p", { class: "uc-stylebook__hero-copy" }, "Local fixtures for visual review."),
        ]),
        h("section", { id: "palette", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Palette"),
          h(
            "p",
            { class: "uc-stylebook__section-description" },
            "Core semantic roles are shown through the configured Quasar palette.",
          ),
          h("div", { class: "uc-stylebook__palette" }, [
            ...["primary", "secondary", "accent", "positive", "warning", "negative", "info"].map(
              (color) => h(QChip, { color, textColor: "white" }, () => color),
            ),
          ]),
          h(
            QBanner,
            { class: "uc-stylebook__banner" },
            () => "Applications own the palette through Quasar configuration.",
          ),
        ]),
        h("section", { id: "typography", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Typography"),
          h("h1", {}, "Heading one"),
          h("h2", {}, "Heading two"),
          h("p", {}, "Body text demonstrates the application typography without a UiCogs skin."),
          h("small", {}, "Supporting caption text"),
        ]),
        h("section", { id: "buttons", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Buttons"),
          h("div", { class: "uc-stylebook__button-row" }, [
            h(QBtn, { label: "Primary", color: "primary" }),
            h(QBtn, { label: "Secondary", flat: true }),
            h(QBtn, { label: "Disabled", disable: true }),
          ]),
        ]),
        h("section", { id: "cards", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Cards and lists"),
          h(QCard, { class: "uc-stylebook__card" }, () =>
            h(QCardSection, {}, () => [
              h("h3", {}, "Fixture card"),
              h("p", {}, "A default Quasar card with no UiCogs styling."),
            ]),
          ),
          h(QList, { bordered: true, class: "uc-stylebook__list" }, () => [
            listItem("Open work", "12 records"),
            listItem("Needs review", "4 records"),
          ]),
        ]),
        h("section", { id: "feedback", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Feedback"),
          h(QBanner, { class: "uc-stylebook__banner" }, () => "Informational fixture message"),
          h(
            QBanner,
            { class: "uc-stylebook__banner" },
            () => "Validation and network feedback are application-owned.",
          ),
        ]),
        h("section", { id: "forms", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Form"),
          h("div", { class: "uc-stylebook__surface" }, [h(UcForm, { form })]),
        ]),
        h("section", { id: "filters", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Filters"),
          h("div", { class: "uc-stylebook__surface" }, [
            h(UcFilter, { form: filters, defaultExpanded: false }),
          ]),
          h("div", { class: "uc-stylebook__surface" }, [
            h(UcFilter, { form: expandedFilters, defaultExpanded: true }),
          ]),
        ]),
        h("section", { id: "table", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Table"),
          h("div", { class: "uc-stylebook__surface" }, [
            h(UcTable, { collection: tableFixture, noPagination: true }),
          ]),
        ]),
        h("section", { id: "notifications", class: "uc-stylebook__section" }, [
          h("h2", { class: "uc-stylebook__section-title" }, "Notifications"),
          h("div", { class: "uc-stylebook__surface" }, [
            h(UcNotificationList, { items: notificationFixture }),
          ]),
        ]),
        h(UcStylebookCharts),
      ]);
  },
});

const tableFixture = {
  resource: Object.freeze({ name: "fixture-work", schema: filterSchema, key: "title" }),
  loading: false,
  getSnapshot: () => Object.freeze({ revision: 0 }),
  subscribe: () => () => undefined,
  all: () =>
    Object.freeze([
      Object.freeze({ title: "Review visual states", status: "open", owner: "Design" }),
      Object.freeze({ title: "Confirm accessibility", status: "review", owner: "Platform" }),
      Object.freeze({ title: "Prepare release notes", status: "done", owner: "Documentation" }),
      Object.freeze({ title: "Validate error states", status: "open", owner: "Quality" }),
      Object.freeze({ title: "Review audit trail", status: "review", owner: "Security" }),
      Object.freeze({ title: "Refresh customer fixtures", status: "done", owner: "Support" }),
      Object.freeze({ title: "Check keyboard navigation", status: "open", owner: "Accessibility" }),
      Object.freeze({ title: "Publish component report", status: "review", owner: "Platform" }),
    ]),
  load: async () => undefined,
  refresh: async () => undefined,
  page: () => tableFixture,
  sort: () => tableFixture,
  nextPage: () => tableFixture,
  hasMore: () => false,
};

const notificationFixture = Object.freeze([
  Object.freeze({
    id: "review-ready",
    title: "Review ready",
    message: "The fixture report can be reviewed.",
    level: "info" as const,
    read: false,
    createdAt: "Just now",
  }),
  Object.freeze({
    id: "completed",
    title: "Export completed",
    message: "No action is required.",
    level: "positive" as const,
    read: true,
    createdAt: "Earlier today",
  }),
]);

function pageItem(label: string, active: boolean, onClick: () => void): ReturnType<typeof h> {
  return h(
    QItem,
    { active, clickable: true, onClick, class: "uc-stylebook__navigation-item" },
    () => h(QItemSection, {}, () => h(QItemLabel, {}, () => label)),
  );
}

function indexItem(item: (typeof overviewIndex)[number]): ReturnType<typeof h> {
  return h(
    QItem,
    {
      key: item.id,
      tag: "a",
      href: `#${item.id}`,
      clickable: true,
      class: "uc-stylebook__index-item",
    },
    () => h(QItemSection, {}, () => h(QItemLabel, {}, () => item.label)),
  );
}

interface StylebookQuasarGlobal {
  readonly dark: {
    readonly isActive: boolean;
    set(value: boolean): void;
  };
}

function quasarForStylebook(): StylebookQuasarGlobal {
  const value = getCurrentInstance()?.proxy?.$q;
  if (
    typeof value === "object" &&
    value !== null &&
    "dark" in value &&
    typeof value.dark === "object" &&
    value.dark !== null &&
    "isActive" in value.dark &&
    "set" in value.dark &&
    typeof value.dark.set === "function"
  )
    return value as StylebookQuasarGlobal;
  throw new Error("UcStylebook requires the Quasar plugin");
}

function listItem(label: string, caption: string): ReturnType<typeof h> {
  return h(QItem, {}, () =>
    h(QItemSection, {}, () => [
      h(QItemLabel, {}, () => label),
      h(QItemLabel, { caption: true }, () => caption),
    ]),
  );
}
