import * as vscode from "vscode";
import { ORIGIN_RE } from "./webviewContent";

const FALLBACK = "https://hypergraph.digital";

const complained = new Set<string>();

export function serverOrigin(): string {
  const raw = String(vscode.workspace.getConfiguration("hypergraph").get<string>("url", FALLBACK) || "");

  let origin = "";
  try {
    origin = new URL(raw).origin;
  } catch {
    origin = "";
  }
  if (ORIGIN_RE.test(origin)) return origin;

  if (!complained.has(raw)) {
    complained.add(raw);
    vscode.window.showWarningMessage(
      `Hypergraph: hypergraph.url is not a usable http(s) origin (${raw || "empty"}) — using ${FALLBACK} instead.`,
    );
  }
  return FALLBACK;
}
