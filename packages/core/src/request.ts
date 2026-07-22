interface InFlight<T> {
  readonly controller: AbortController;
  readonly promise: Promise<T>;
  observers: number;
  settled: boolean;
}

export class RequestCoordinator {
  private readonly requests = new Map<string, InFlight<unknown>>();
  private disposed = false;

  get isDisposed(): boolean {
    return this.disposed;
  }

  coordinate<T>(
    identity: string,
    load: (signal: AbortSignal) => Promise<T>,
    observerSignal?: AbortSignal,
  ): Promise<T> {
    if (this.disposed) return Promise.reject(abortError());
    let request = this.requests.get(identity) as InFlight<T> | undefined;
    if (!request) {
      const controller = new AbortController();
      let execution: Promise<T>;
      try {
        execution = load(controller.signal);
      } catch (error) {
        execution = Promise.reject(error);
      }
      request = {
        controller,
        observers: 0,
        settled: false,
        promise: execution.finally(() => {
          request!.settled = true;
          if (this.requests.get(identity) === request) this.requests.delete(identity);
        }),
      };
      this.requests.set(identity, request as InFlight<unknown>);
    }
    request.observers += 1;
    return observe(request, observerSignal);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortAll();
  }

  abortAll(): void {
    for (const request of this.requests.values()) request.controller.abort();
    this.requests.clear();
  }
}

function observe<T>(request: InFlight<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    release(request);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    let active = true;
    const finish = (callback: () => void): void => {
      if (!active) return;
      active = false;
      signal?.removeEventListener("abort", abort);
      request.controller.signal.removeEventListener("abort", sharedAbort);
      release(request);
      callback();
    };
    const abort = (): void => finish(() => reject(abortError()));
    const sharedAbort = (): void => finish(() => reject(abortError()));
    signal?.addEventListener("abort", abort, { once: true });
    request.controller.signal.addEventListener("abort", sharedAbort, { once: true });
    request.promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function release(request: InFlight<unknown>): void {
  if (request.observers <= 0) return;
  request.observers -= 1;
  if (!request.observers && !request.settled) request.controller.abort();
}

function abortError(): Error {
  return new DOMException("The operation was aborted", "AbortError");
}
