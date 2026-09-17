import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { requireAccount } from "./pairing";
import { authenticate, forgetDeviceKey } from "./identity";
import { serverOrigin } from "./config";
import { Mount, remountAll, signOutAll } from "./mount";
import { getChannel, log } from "./log";

function detachedMessage(err: unknown): string {
  return `Hypergraph: not connected to an account — ${err instanceof Error ? err.message : String(err)}`;
}

export function activate(context: vscode.ExtensionContext) {
  log("activate() called");
  context.subscriptions.push(getChannel());

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hypergraph.sidebarView", new SidebarProvider(context.extensionUri, context))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.pairDevice", async () => {
      try {
        const identity = await requireAccount(context, serverOrigin());
        vscode.window.showInformationMessage(`Hypergraph: this device is on account ${identity.account.slice(0, 8)}`);
        remountAll();
      } catch (err) {
        vscode.window.showErrorMessage(detachedMessage(err));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.signOut", async () => {
      const origin = serverOrigin();
      const identity = await authenticate(context, origin).catch(() => null);
      const on = identity && identity.account ? ` from account ${identity.account.slice(0, 8)}` : "";
      const confirm = await vscode.window.showWarningMessage(
        `Forget this device's key${on}? The next open pairs a new key. The old key stays a member on the server until removed there.`,
        { modal: true },
        "Forget key",
      );
      if (confirm !== "Forget key") return;
      await forgetDeviceKey(context);
      signOutAll("this device's key was forgotten");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hypergraph.openPanel", async () => {
      const panel = vscode.window.createWebviewPanel(
        "hypergraphPanel",
        "Hypergraph",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      const mount = new Mount(panel.webview, context);
      panel.onDidDispose(() => mount.dispose());
      await mount.render();
    })
  );
}

export function deactivate() {}
