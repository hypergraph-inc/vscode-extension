import * as vscode from "vscode";
import { getWebviewContent } from "./webviewContent";
import { authenticate, serveIdentity } from "./identity";
import { serverOrigin } from "./config";
import { log, logError } from "./log";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    log("resolveWebviewView() called");

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const origin = serverOrigin();
    log(`resolved server origin: ${origin}`);

    let ticket: string | undefined;
    let token: string | undefined;
    try {
      const identity = await authenticate(this.context, origin);
      ticket = identity.ticket;
      token = identity.token;
      log(`authenticate() succeeded (ticket present: ${!!ticket}, token present: ${!!token})`);
    } catch (err: any) {
      logError(`authenticate() failed against ${origin}`, err);
      vscode.window.showWarningMessage(
        `Hypergraph: signed out — could not authenticate with ${origin} (${err && err.message}).`,
      );
    }

    try {
      webviewView.webview.html = getWebviewContent(origin, ticket, token);
      log("webviewView.webview.html assigned");
    } catch (err: any) {
      logError("getWebviewContent() threw — sidebar will stay blank", err);
      throw err;
    }

    const pump = serveIdentity(webviewView.webview, this.context, origin);
    webviewView.onDidDispose(() => {
      log("sidebar webview disposed");
      pump.dispose();
    });
  }
}
