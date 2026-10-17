export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * No frontend framework on purpose: this is an internal, low-traffic page
 * for one or two people to copy-paste text into WhatsApp. A static HTML
 * string keeps the server's memory footprint (and the hosting bill) small.
 */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  nav a { margin-right: 1rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .card pre { white-space: pre-wrap; background: #f6f6f6; padding: 0.75rem; border-radius: 6px; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 0.5rem; }
  button, input[type=submit] { cursor: pointer; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #ccc; background: #fff; margin-right: 0.5rem; }
  button:hover, input[type=submit]:hover { background: #f0f0f0; }
  form.inline { display: inline; }
  label { display: block; margin-top: 0.5rem; font-size: 0.9rem; }
  input[type=text], input[type=url], input[type=email], textarea { width: 100%; padding: 0.4rem; box-sizing: border-box; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 10px; background: #eee; font-size: 0.75rem; }
</style>
</head>
<body>
<nav>
  <a href="/internal/posts">Posting-Liste</a>
  <a href="/internal/places/review">Orte zur Prüfung</a>
  <a href="/internal/places/new">Neuer Ort</a>
  <a href="/internal/listings/review">Inserate zur Freigabe</a>
</nav>
<h1>${escapeHtml(title)}</h1>
${body}
<script>
function copyText(id) {
  const el = document.getElementById(id);
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = document.getElementById(id + '-btn');
    if (btn) { const old = btn.textContent; btn.textContent = 'Kopiert!'; setTimeout(() => btn.textContent = old, 1500); }
  });
}
</script>
</body>
</html>`;
}
