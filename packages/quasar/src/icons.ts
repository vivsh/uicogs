import { type UiCogsIconName } from "@uicogs/core";
import { useUiCogs } from "@uicogs/vue";

const quasarDefaults: Readonly<Partial<Record<UiCogsIconName, string>>> = Object.freeze({
  add: "add",
  back: "arrow_back",
  cancel: "close",
  clear: "close",
  close: "close",
  collapse: "expand_less",
  create: "add",
  date: "today",
  dateRange: "today",
  delete: "delete",
  download: "download",
  edit: "edit",
  error: "error",
  expand: "expand_more",
  filter: "filter_list",
  info: "info",
  menu: "menu",
  next: "chevron_right",
  notifications: "notifications",
  open: "open_in_new",
  previous: "chevron_left",
  refresh: "refresh",
  remove: "close",
  retry: "refresh",
  search: "search",
  success: "check_circle",
  time: "access_time",
  upload: "upload",
  warning: "warning",
});

/** Resolves runtime icon overrides and Quasar's native fallback for semantic UiCogs tokens. */
export function useUcIcon(): (name: string, fallback?: string) => string {
  const resolve = injectedIconResolver();
  return (name, fallback) => {
    const resolved = resolve?.(name) ?? name;
    if (resolved !== name) return resolved;
    return fallback ?? quasarDefaults[name as UiCogsIconName] ?? name;
  };
}

function injectedIconResolver(): ((name: string) => string) | undefined {
  try {
    const cogs = useUiCogs();
    return cogs.icon ? (name) => cogs.icon!(name) : undefined;
  } catch {
    return undefined;
  }
}
