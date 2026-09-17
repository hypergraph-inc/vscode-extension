import * as vscode from "vscode";
import { serverOrigin } from "./config";
import { serveIdentity } from "./identity";
import { log, logError } from "./log";
import { requireAccount } from "./pairing";
import { serverUnreachable } from "./ping";
import { getWebviewContent, statusHtml } from "./webviewContent";

const SIGN_IN = `Run "Hypergraph: Pair Device with Account" from the command palette to sign in.`;
const RECONNECT = `Start the server, then run "Hypergraph: Pair Device with Account" from the command palette to reconnect.`;

const live = new Set<Mount>();

export function remountAll(): void {
  for (const mount of live) void mount.render();
}

export function signOutAll(reason: string): void {
  for (const mount of live) mount.signedOut(reason);
}

export class Mount implements vscode.Disposable {
  private pump: vscode.Disposable | undefined;
  private generation = 0;

  constructor(private readonly webview: vscode.Webview, private readonly context: vscode.ExtensionContext) {
    live.add(this);
  }

  async render(): Promise<void> {
    const generation = this.reset();
    const origin = serverOrigin();
    this.webview.html = statusHtml(`Connecting to ${origin}`, []);

    const down = await serverUnreachable(origin);
    if (generation !== this.generation) return;
    if (down) {
      logError(`mount: ${origin} is unreachable — ${down}`);
      this.webview.html = statusHtml("Cannot reach the Hypergraph server", [`${origin}: ${down}`, RECONNECT]);
      return;
    }

    let identity;
    try {
      identity = await requireAccount(this.context, origin);
    } catch (err) {
      if (generation !== this.generation) return;
      logError(`mount: no account for this device on ${origin}`, err);
      this.signedOut(err instanceof Error ? err.message : String(err));
      return;
    }
    if (generation !== this.generation) return;

    this.webview.html = getWebviewContent(origin, identity);
    log(`mount: loaded account ${identity.account.slice(0, 8)}`);
    this.pump = serveIdentity(this.webview, this.context, origin, () => {
      if (generation === this.generation) this.signedOut("this device was removed from its account");
    });
  }

  signedOut(reason: string): void {
    this.reset();
    this.webview.html = statusHtml("Signed out", [reason, SIGN_IN]);
  }

  dispose(): void {
    live.delete(this);
    this.reset();
  }

  private reset(): number {
    this.pump?.dispose();
    this.pump = undefined;
    return ++this.generation;
  }
}
