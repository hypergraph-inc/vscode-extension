import { randomBytes } from "node:crypto";
import type { AccountIdentity } from "./identity";
import { log } from "./log";

export const ORIGIN_RE = /^https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9.\-]+)(:\d{1,5})?$/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function statusHtml(title: string, lines: string[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-editor-background); padding: 12px; }</style>
</head>
<body>
  <p><strong>${escapeHtml(title)}</strong></p>
  ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n  ")}
</body>
</html>`;
}

export function getWebviewContent(origin: string, identity: AccountIdentity): string {
  if (!ORIGIN_RE.test(origin)) {
    log(`getWebviewContent: rejecting origin that fails ORIGIN_RE: ${origin}`);
    throw new Error(`refusing to embed ${origin}`);
  }

  const target = new URL(origin);
  target.searchParams.set("t", identity.ticket);
  target.searchParams.set("d", identity.account);

  const nonce = randomBytes(16).toString("base64");
  const src = target.toString().replace(/&/g, "&amp;");
  log(`getWebviewContent: built iframe src for ${target.origin}${target.pathname} as account ${identity.account.slice(0, 8)}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; background-color: var(--vscode-editor-background); }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${src}" allow="clipboard-read; clipboard-write"></iframe>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const frame = document.querySelector('iframe');
    const ORIGIN = ${JSON.stringify(target.origin)};

    function debug(message) {
      try { vscode.postMessage({ type: 'hypergraph.debug', message }); } catch (e) { /* ignore */ }
    }

    debug('wrapper script started, target origin ' + ORIGIN +
      ', wrapper origin ' + location.origin +
      ', ancestors [' + Array.from(location.ancestorOrigins || []).join(', ') + ']');

    document.addEventListener('securitypolicyviolation', (e) => {
      debug('CSP violation: directive=' + e.violatedDirective + ' blockedURI=' + e.blockedURI);
    });

    let loaded = false;
    let booted = false;
    frame.addEventListener('load', () => {
      loaded = true;
      debug('iframe load event fired for ' + ORIGIN);
    });
    setTimeout(() => {
      if (booted) return;
      if (!loaded) debug('iframe never fired load within 8s (still connecting, or refused)');
      else debug('iframe loaded but the app never announced itself within 8s — the child document is blocked (frame-ancestors/X-Frame-Options) or its script did not run');
    }, 8000);

    window.addEventListener('message', (e) => {
      const inner = frame.contentWindow;
      if (!inner) return;
      if (e.source === inner) {
        if (e.origin !== ORIGIN) return;
        if (e.data && e.data.type === 'hypergraph.boot') {
          booted = true;
          debug('app announced itself from inside the iframe');
          return;
        }
        vscode.postMessage(e.data);
        return;
      }
      if (e.source === null || e.source === window) inner.postMessage(e.data, ORIGIN);
    });
  </script>
</body>
</html>`;
}
