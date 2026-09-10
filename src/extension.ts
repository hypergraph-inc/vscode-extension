import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { getWebviewContent } from "./webviewContent";
import { forgetPairing, pairDevice, pairedAccount, promptToPairIfNeeded } from "./pairing";

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hypergraph.sidebarView", sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.pairDevice", () => pairDevice(context))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.signOut", async () => {
      const account = pairedAccount(context);
      if (!account) {
        vscode.window.showInformationMessage("Hypergraph: this device is not paired with an account.");
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Forget this device's pairing with account ${account.slice(0, 8)}? The device stays enrolled on the server until removed there too.`,
        { modal: true },
        "Forget pairing",
      );
      if (confirm === "Forget pairing") await forgetPairing(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.openPanel", async () => {
      const url = vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital");

      try {
        const panel = vscode.window.createWebviewPanel(
          "hypergraphPanel",
          "Hypergraph",
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        let ticket: string | undefined;
        try {
          const identity = await import("./identity").then(m => m.authenticate(context, url));
          ticket = identity.ticket;
        } catch {
          // If authentication fails, load without a ticket
        }

        panel.webview.html = getWebviewContent(url, ticket);
      } catch(e) {
        // console.error('')
      }

      try {
        void promptToPairIfNeeded(context);
      } catch {
        //
      }
    })
  );
}

export function deactivate() {}
