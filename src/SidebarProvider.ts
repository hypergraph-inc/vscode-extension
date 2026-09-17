import * as vscode from "vscode";
import { Mount } from "./mount";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    const mount = new Mount(webviewView.webview, this.context);
    webviewView.onDidDispose(() => mount.dispose());
    await mount.render();
  }
}
