# @uicogs/react API

Declaration SHA-256: `e72ec6d8cced014891c6aab839bd38bc4ac738404ee4539225c58ea215cd9f71`

```ts
// index.d.ts
import * as _uicogs_core from '@uicogs/core';
import { AuthStrategyDefinition, ResourceDefinitionIdentity, CogsOptions, ExternalStore } from '@uicogs/core';
export * from '@uicogs/core';

declare function createUiCogs<TApplicationContext = undefined, TEvents extends object = Readonly<Record<never, never>>, TAuth extends AuthStrategyDefinition | undefined = undefined, const TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[]>(options: CogsOptions<TApplicationContext, TAuth, TResources>): _uicogs_core.Cogs<TApplicationContext, TEvents, TAuth, TResources>;
declare function useController<TSnapshot extends object, TController extends ExternalStore<TSnapshot>>(controller: TController): TController;
declare const useResource: typeof useController;
declare const useObject: typeof useController;
declare const useCollection: typeof useController;
declare const useForm: typeof useController;
declare const useAction: typeof useController;
declare const useAuth: typeof useController;

export { createUiCogs, useAction, useAuth, useCollection, useController, useForm, useObject, useResource };
```
