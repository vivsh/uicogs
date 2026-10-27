import { QBtn, QCard, QCardSection, QPage } from "quasar";
import { defineComponent, h } from "vue";

/** Controlled props shared by UiCogs' route-friendly Quasar error pages. */
export interface UcErrorPageProps {
  /** HTTP-like status used to select the default copy. */
  readonly status: number;
  /** Application override for the default page heading. */
  readonly title?: string;
  /** Application override for the default explanatory text. */
  readonly message?: string;
  /** Shows the built-in retry control when no actions slot replaces it. */
  readonly retryable?: boolean;
  /** Disables the built-in retry control while the application retries. */
  readonly retrying?: boolean;
  /** Application override for the built-in retry label. */
  readonly retryLabel?: string;
}

/** Slot bindings for application-owned error page actions. */
export interface UcErrorPageActions {
  readonly retry: () => void;
  readonly retrying: boolean;
}

interface ErrorCopy {
  readonly title: string;
  readonly message: string;
}

const sharedErrorPageProps = {
  title: String,
  message: String,
  retryable: Boolean,
  retrying: Boolean,
  retryLabel: String,
};
const errorPageProps = { status: { type: Number, required: true }, ...sharedErrorPageProps };

/** Renders a safe, unstyled default page for a client-visible request failure. */
export const UcErrorPage = defineComponent({
  name: "UcErrorPage",
  props: errorPageProps,
  emits: ["retry"],
  setup(props, { emit, slots }) {
    const retry = (): void => {
      if (!props.retrying) emit("retry");
    };
    return () => {
      const status = props.status ?? 500;
      const copy = errorCopy(status);
      const title = props.title ?? copy.title;
      const message = props.message ?? copy.message;
      const actions: UcErrorPageActions = { retry, retrying: props.retrying };
      const actionContent =
        slots.actions?.(actions) ??
        (props.retryable
          ? [
              h(QBtn, {
                class: "uc-error-page__retry",
                color: "primary",
                label: props.retryLabel ?? "Try again",
                loading: props.retrying,
                disable: props.retrying,
                onClick: retry,
              }),
            ]
          : []);
      return h(QPage, { class: ["uc-error-page", "flex", "flex-center", "q-pa-md"] }, () =>
        h(QCard, { class: "uc-error-page__card" }, () =>
          h(QCardSection, {}, () => [
            h("div", { class: "uc-error-page__status" }, String(status)),
            h("h1", { class: "uc-error-page__title" }, title),
            h("p", { class: "uc-error-page__message" }, message),
            actionContent.length > 0
              ? h("div", { class: "uc-error-page__actions" }, () => actionContent)
              : undefined,
          ]),
        ),
      );
    };
  },
});

/** Renders the standard UiCogs 401 page. */
export const UcUnauthorizedPage = errorPage("UcUnauthorizedPage", 401);
/** Renders the standard UiCogs 403 page. */
export const UcForbiddenPage = errorPage("UcForbiddenPage", 403);
/** Renders the standard UiCogs 404 page. */
export const UcNotFoundPage = errorPage("UcNotFoundPage", 404);
/** Renders the standard UiCogs 5xx page. Applications may override its status. */
export const UcServerErrorPage = defineComponent({
  name: "UcServerErrorPage",
  props: { ...sharedErrorPageProps, status: { type: Number, default: 500 } },
  emits: ["retry"],
  setup(props, { attrs, emit, slots }) {
    return () => h(UcErrorPage, { ...attrs, ...props, onRetry: () => emit("retry") }, slots);
  },
});

function errorPage(name: string, status: number) {
  return defineComponent({
    name,
    props: sharedErrorPageProps,
    emits: ["retry"],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          UcErrorPage,
          {
            ...attrs,
            ...props,
            status,
            onRetry: () => emit("retry"),
          },
          slots,
        );
    },
  });
}

function errorCopy(status: number): ErrorCopy {
  if (status === 401)
    return { title: "Sign in required", message: "Sign in to continue to this page." };
  if (status === 403)
    return { title: "Access denied", message: "You do not have access to this page." };
  if (status === 404)
    return {
      title: "Page not found",
      message: "This page does not exist or is no longer available.",
    };
  if (status >= 500 && status <= 599)
    return {
      title: "Something went wrong",
      message: "The service could not complete this request.",
    };
  return { title: "Request failed", message: "The requested page could not be displayed." };
}
