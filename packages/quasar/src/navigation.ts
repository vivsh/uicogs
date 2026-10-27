import type { UiCogsNavigationNode } from "@uicogs/vue";
import { QBadge, QIcon, QItem, QItemLabel, QItemSection, QList } from "quasar";
import { defineComponent, h, type PropType } from "vue";
import { useUcIcon } from "./icons.js";

/** A small, accessible indicator rendered beside a generated navigation node. */
export interface UcNavigationBadge {
  readonly value: string | number;
  readonly label: string;
}

/** Navigation badges keyed by UiCogs navigation node id. */
export type UcNavigationBadges = Readonly<Record<string, UcNavigationBadge | undefined>>;

/** Renders a scoped UiCogs navigation tree with optional application-provided badges. */
export const UcNavigationTree = defineComponent({
  name: "UcNavigationTree",
  props: {
    nodes: { type: Array as PropType<readonly UiCogsNavigationNode[]>, required: true },
    badges: { type: Object as PropType<UcNavigationBadges>, default: () => ({}) },
  },
  setup(props) {
    const icon = useUcIcon();
    return () =>
      h(QList, { class: "uc-navigation-tree q-mt-lg" }, () =>
        renderNodes(props.nodes, props.badges, icon),
      );
  },
});

function renderNodes(
  nodes: readonly UiCogsNavigationNode[],
  badges: UcNavigationBadges,
  icon: (name: string) => string,
): readonly ReturnType<typeof h>[] {
  return nodes.map((node) => {
    if (node.kind === "group") {
      return h("div", { key: node.id, class: "uc-navigation-tree__group" }, [
        h(QItemLabel, { header: true, class: "uc-navigation-tree__group-label" }, () => node.label),
        h(UcNavigationTree, { nodes: node.children, badges }),
      ]);
    }
    const badge = badges[node.id];
    return h(
      QItem,
      {
        key: node.id,
        class: [
          "uc-navigation-tree__item",
          ...(node.current ? ["uc-navigation-tree__item--active"] : []),
        ],
        active: node.current,
        clickable: node.to !== undefined,
        ...(node.to === undefined ? {} : { to: node.to }),
      },
      () => [
        renderIcon(node.icon, icon),
        h(QItemSection, {}, () => h(QItemLabel, {}, () => node.label)),
        badge
          ? h(QItemSection, { side: true }, () =>
              h(QBadge, { class: "uc-navigation-tree__badge", "aria-label": badge.label }, () =>
                String(badge.value),
              ),
            )
          : undefined,
      ],
    );
  });
}

function renderIcon(
  value: unknown,
  icon: (name: string) => string,
): ReturnType<typeof h> | undefined {
  if (typeof value !== "string") return undefined;
  return h(QItemSection, { avatar: true }, () => h(QIcon, { name: icon(value) }));
}
