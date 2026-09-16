import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getChannel(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel("Hypergraph");
  return channel;
}

export function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  getChannel().appendLine(line);
}

export function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack || ""}` : err !== undefined ? String(err) : "";
  log(`ERROR: ${message}${detail ? ` — ${detail}` : ""}`);
}
