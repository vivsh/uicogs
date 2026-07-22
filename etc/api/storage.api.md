# @uicogs/storage API

Declaration SHA-256: `e8f053b57dce56c03b2285006dfd8d612ef751c3ed7640639a320660b143a44c`

```ts
// index.d.ts
import { PersistenceBackend } from '@uicogs/core';

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
interface WebStorageOptions {
    readonly namespace: string;
    readonly storage?: StorageLike;
}
interface IndexedDbStorageOptions {
    readonly database: string;
    readonly store: string;
    readonly namespace: string;
    readonly version?: number;
    readonly indexedDB?: IDBFactory;
}
declare function local(options: WebStorageOptions): PersistenceBackend;
declare function session(options: WebStorageOptions): PersistenceBackend;
declare function indexedDb(options: IndexedDbStorageOptions): PersistenceBackend;
declare const storage: Readonly<{
    local: typeof local;
    session: typeof session;
    indexedDb: typeof indexedDb;
}>;

export { type IndexedDbStorageOptions, type StorageLike, type WebStorageOptions, indexedDb, local, session, storage };
```
