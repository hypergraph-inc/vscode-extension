import * as vscode from "vscode";
import { getWebviewContent } from "./webviewContent";
import { authenticate, Identity } from "./identity";

let cachedIdentity: Identity | null = null;

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const url = vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital");

    let ticket: string | undefined;
    try {
      if (!cachedIdentity) {
        cachedIdentity = await authenticate(this.context, url);
      }
      ticket = cachedIdentity.ticket;
    } catch {
      // If authentication fails, load without a ticket
    }

    webviewView.webview.html = getWebviewContent(url, ticket);
  }
}
