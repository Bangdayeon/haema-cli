export const LIVE_RELOAD_SCRIPT = `<script>
(function () {
  var last = null;
  async function poll() {
    try {
      var r = await fetch('/__votra/version', { cache: 'no-store' });
      if (!r.ok) return;
      var j = await r.json();
      if (last === null) { last = j.stamp; return; }
      if (j.stamp !== last) { location.reload(); }
    } catch (e) {}
  }
  setInterval(poll, 800);
  poll();
})();
</script>`;

export function injectLiveReload(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", LIVE_RELOAD_SCRIPT + "</body>");
  }
  return html + LIVE_RELOAD_SCRIPT;
}
