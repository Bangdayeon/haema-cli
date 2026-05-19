import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

type Options = {
  intervalMs?: number;
  pattern?: RegExp;
};

export function watchDirChanges(
  dir: string,
  onChange: () => void | Promise<void>,
  options: Options = {}
): () => void {
  const interval = options.intervalMs ?? 800;
  const pattern = options.pattern ?? /.*/;
  let state = new Map<string, number>();
  let running = false;
  let pending = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const next = await snapshot(dir, pattern);
    if (!equal(state, next)) {
      state = next;
      schedule();
    }
  };

  function schedule(): void {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    void (async () => {
      try {
        await onChange();
      } finally {
        running = false;
        if (pending) {
          pending = false;
          schedule();
        }
      }
    })();
  }

  void snapshot(dir, pattern).then((s) => {
    state = s;
  });

  const handle = setInterval(() => {
    void tick();
  }, interval);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

async function snapshot(dir: string, pattern: RegExp): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (!pattern.test(name)) continue;
    try {
      const s = await stat(join(dir, name));
      out.set(name, s.mtimeMs * 1_000_000 + s.size);
    } catch {
      // 파일이 사라진 경우 건너뜀
    }
  }
  return out;
}

function equal(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}
