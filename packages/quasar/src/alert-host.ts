import type { AlertController, UiAlert } from "@uicogs/core";
import { useUiCogs } from "@uicogs/vue";
import { Notify, type QNotifyCreateOptions } from "quasar";
import { defineComponent, watchEffect, type PropType } from "vue";

/** Delivers each core live alert once through Quasar Notify. Mount it once outside UcAppLayout. */
export const UcAlertHost = defineComponent({
  name: "UcAlertHost",
  props: { source: Object as PropType<AlertController> },
  setup(props) {
    const source = props.source ?? injectedAlerts();
    watchEffect(() => {
      const alert = source?.items[0];
      if (!alert) return;
      source.consume();
      Notify.create(alertOptions(alert));
    });
    return () => undefined;
  },
});

function injectedAlerts(): AlertController | undefined {
  try {
    return useUiCogs().alerts;
  } catch {
    return undefined;
  }
}

function alertOptions(alert: UiAlert): QNotifyCreateOptions {
  return {
    message: alert.message,
    ...(alert.caption ? { caption: alert.caption } : {}),
    ...(alert.level ? { type: alert.level } : {}),
    ...(alert.icon ? { icon: alert.icon } : {}),
    ...(alert.timeout === undefined ? {} : { timeout: alert.timeout }),
  };
}
