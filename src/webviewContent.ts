import { randomBytes } from "node:crypto";

export function getWebviewContent(url: string, ticket?: string, token?: string): string {
  const src = ticket
    ? `${url}?t=${encodeURIComponent(ticket)}${token ? `&d=${encodeURIComponent(token)}` : ""}`
    : url;
  const nonce = randomBytes(16).toString("base64");
  const origin = JSON.stringify(new URL(url).origin);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${url}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    const ORIGIN = ${origin};
    window.addEventListener('message', (e) => {
      const inner = frame.contentWindow;
      if (!inner) return;
      if (e.source === inner) { vscode.postMessage(e.data); return; }
      if (e.source === null || e.source === window) inner.postMessage(e.data, ORIGIN);
    });
  </script>
</body>
</html>`;
}
