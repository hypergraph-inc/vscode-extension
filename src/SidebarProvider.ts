import * as vscode from "vscode";
import { getWebviewContent } from "./webviewContent";
import { authenticate, serveIdentity } from "./identity";
import { serverOrigin } from "./config";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const origin = serverOrigin();

    let ticket: string | undefined;
    let token: string | undefined;
    try {
      const identity = await authenticate(this.context, origin);
      ticket = identity.ticket;
      token = identity.token;
    } catch (err: any) {
      vscode.window.showWarningMessage(
        `Hypergraph: signed out — could not authenticate with ${origin} (${err && err.message}).`,
      );
    }

    webviewView.webview.html = getWebviewContent(origin, ticket, token);

    const pump = serveIdentity(webviewView.webview, this.context, origin);
    webviewView.onDidDispose(() => pump.dispose());
  }
}
