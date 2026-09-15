import * as vscode from "vscode";
import { getWebviewContent } from "./webviewContent";
import { authenticate, serveIdentity } from "./identity";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const url = vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital");

    let ticket: string | undefined;
    let token: string | undefined;
    try {
      const identity = await authenticate(this.context, url);
      ticket = identity.ticket;
      token = identity.token;
    } catch {
      // If authentication fails, load without a ticket
    }

    webviewView.webview.html = getWebviewContent(url, ticket, token);

    const pump = serveIdentity(webviewView.webview, this.context, url);
    webviewView.onDidDispose(() => pump.dispose());
  }
}
