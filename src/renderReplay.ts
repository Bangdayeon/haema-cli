import type { Session, TimelineItem } from "./types.js";

export function renderReplayHtml(sessions: SessionTimeline[], sourcePath: string): string {
  const totalItems = sessions.reduce((n, s) => n + s.timeline.length, 0);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>votra replay · ${escape(sessions[0]?.session.title ?? "session")}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>votra replay</h1>
  <p class="meta">${escape(sourcePath)} · 세션 ${sessions.length}개 · 이벤트 ${totalItems}개</p>
</header>
${sessions.map(renderSession).join("\n")}
</body>
</html>`;
}

export type SessionTimeline = {
  session: Session;
  timeline: TimelineItem[];
};

function renderSession({ session, timeline }: SessionTimeline): string {
  return `<section class="session">
  <h2>${escape(session.title)}</h2>
  <p class="meta">${escape(session.id)} · ${escape(session.startedAt ?? "?")} → ${escape(session.endedAt ?? "?")} · ${timeline.length} items</p>
  <ol class="timeline">
    ${timeline.map(renderItem).join("\n")}
  </ol>
</section>`;
}

function renderItem(item: TimelineItem): string {
  const time = item.occurredAt ? new Date(item.occurredAt).toLocaleString() : "";
  const badge = `<span class="badge badge-${item.kind.toLowerCase()}">${item.kind}</span>`;
  const tool = item.toolName ? `<span class="tool">${escape(item.toolName)}</span>` : "";
  const path = item.path ? `<code class="path">${escape(item.path)}</code>` : "";
  const content = item.content ? `<pre class="content">${escape(item.content)}</pre>` : "";
  return `<li class="item role-${item.role}">
    <div class="head">${badge}${tool}${path}<time>${escape(time)}</time></div>
    ${content}
  </li>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Pretendard", system-ui, sans-serif; color: #1a1a1a; background: #fafafa; line-height: 1.5; }
  header { padding: 24px 32px; background: white; border-bottom: 1px solid #e5e5e5; position: sticky; top: 0; z-index: 10; }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  .meta { margin: 0; color: #666; font-size: 13px; }
  section.session { padding: 24px 32px; max-width: 960px; margin: 0 auto; }
  section.session h2 { margin: 0 0 4px; font-size: 16px; }
  ol.timeline { list-style: none; padding: 0; margin: 16px 0 0; }
  .item { padding: 12px 14px; border-left: 3px solid #ddd; background: white; margin-bottom: 8px; border-radius: 4px; }
  .item.role-user { border-left-color: #3b82f6; }
  .item.role-assistant { border-left-color: #10b981; }
  .item.role-tool { border-left-color: #ef4444; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
  .head time { margin-left: auto; color: #999; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; letter-spacing: 0.04em; }
  .badge-prompt { background: #dbeafe; color: #1e40af; }
  .badge-assistant { background: #d1fae5; color: #065f46; }
  .badge-tool_call { background: #fef3c7; color: #92400e; }
  .badge-file_edit { background: #fde68a; color: #78350f; }
  .badge-error { background: #fee2e2; color: #991b1b; }
  .tool { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #555; }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #6b21a8; background: #f3e8ff; padding: 1px 6px; border-radius: 3px; }
  pre.content { margin: 8px 0 0; padding: 10px 12px; background: #f5f5f5; border-radius: 4px; font-size: 13px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
