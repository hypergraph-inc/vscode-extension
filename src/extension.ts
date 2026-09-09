import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { getWebviewContent } from "./webviewContent";

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hypergraph.sidebarView", sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.openPanel", () => {
      const url = vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital");

      const panel = vscode.window.createWebviewPanel(
        "hypergraphPanel",
        "Hypergraph",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      panel.webview.html = getWebviewContent(url);
    })
  );
}

export function deactivate() {}
