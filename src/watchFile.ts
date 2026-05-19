import { unwatchFile, watchFile } from "node:fs";

type Options = {
  intervalMs?: number;
  debounceMs?: number;
};

export function watchFileChanges(
  path: string,
  onChange: () => void | Promise<void>,
  options: Options = {}
): () => void {
  const interval = options.intervalMs ?? 500;
  const debounce = options.debounceMs ?? 200;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let pending = false;

  watchFile(path, { interval }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, debounce);
  });

  async function fire(): Promise<void> {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await onChange();
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void fire();
      }
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    unwatchFile(path);
  };
}
