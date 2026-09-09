import * as vscode from "vscode";
import { getWebviewContent } from "./webviewContent";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const url = vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital");
    webviewView.webview.html = getWebviewContent(url);
  }
}
