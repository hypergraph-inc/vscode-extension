import { randomBytes } from "node:crypto";
import { log } from "./log";

export const ORIGIN_RE = /^https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9.\-]+)(:\d{1,5})?$/;

export function getWebviewContent(origin: string, ticket?: string, token?: string): string {
  if (!ORIGIN_RE.test(origin)) {
    log(`getWebviewContent: rejecting origin that fails ORIGIN_RE: ${origin}`);
    throw new Error(`refusing to embed ${origin}`);
  }

  const target = new URL(origin);
  if (ticket) {
    target.searchParams.set("t", ticket);
    if (token) target.searchParams.set("d", token);
  }

  const nonce = randomBytes(16).toString("base64");
  const src = target.toString().replace(/&/g, "&amp;");
  log(
    `getWebviewContent: built iframe src for origin ${target.origin}${target.pathname} ` +
      `(ticket in query: ${!!ticket}, token in query: ${!!token})`,
  );
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
