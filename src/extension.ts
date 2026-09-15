import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { getWebviewContent } from "./webviewContent";
import { forgetPairing, pairDevice, pairedAccount, promptToPairIfNeeded } from "./pairing";
import { authenticate, serveIdentity } from "./identity";
import { serverOrigin } from "./config";

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
      const origin = serverOrigin();

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
        let token: string | undefined;
        try {
          const identity = await authenticate(context, origin);
          ticket = identity.ticket;
          token = identity.token;
        } catch (err: any) {
          vscode.window.showWarningMessage(
            `Hypergraph: signed out — could not authenticate with ${origin} (${err && err.message}).`,
          );
        }

        panel.webview.html = getWebviewContent(origin, ticket, token);

        const pump = serveIdentity(panel.webview, context, origin);
        panel.onDidDispose(() => pump.dispose());
      } catch (err: any) {
        vscode.window.showErrorMessage(`Hypergraph: could not open the panel — ${err && err.message}`);
        return;
      }

      void promptToPairIfNeeded(context);
    })
  );
}

export function deactivate() {}
