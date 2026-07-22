import {
  createUiCogs as createCoreUiCogs,
  type AuthStrategyDefinition,
  type CogsOptions,
  type ExternalStore,
  type ResourceDefinitionIdentity,
} from "@uicogs/core";
import { useSyncExternalStore } from "react";

export * from "@uicogs/core";

export function createUiCogs<
  TApplicationContext = undefined,
  TEvents extends object = Readonly<Record<never, never>>,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  const TResources extends readonly ResourceDefinitionIdentity[] =
    readonly ResourceDefinitionIdentity[],
>(options: CogsOptions<TApplicationContext, TAuth, TResources>) {
  return createCoreUiCogs<TApplicationContext, TEvents, TAuth, TResources>(options);
}

export function useController<
  TSnapshot extends object,
  TController extends ExternalStore<TSnapshot>,
>(controller: TController): TController {
  useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
  return controller;
}

export const useResource = useController;
export const useObject = useController;
export const useCollection = useController;
export const useForm = useController;
export const useAction = useController;
export const useAuth = useController;
