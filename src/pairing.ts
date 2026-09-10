import * as vscode from "vscode";
import { authenticate } from "./identity";

const PAIRED_KEY = "hypergraph.paired";
const ACCOUNT_KEY = "hypergraph.account";

const originOf = (url: string) => url.replace(/\/+$/, "");

function serverOrigin(): string {
  return originOf(vscode.workspace.getConfiguration("hypergraph").get<string>("url", "https://hypergraph.digital"));
}

export function isPaired(context: vscode.ExtensionContext): boolean {
  return !!context.globalState.get<boolean>(PAIRED_KEY);
}

export function pairedAccount(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>(ACCOUNT_KEY);
}

export async function forgetPairing(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(PAIRED_KEY, undefined);
  await context.globalState.update(ACCOUNT_KEY, undefined);
}

// Mirrors companion/session/pairing.mjs's pairThisKey/awaitAdmission loop, but
// approval joins the device to the account outright (server's
// accounts.join, via POST /device/pair/approve) instead of granting scoped
// companion permissions — see the "device is the identity until it is
// paired" model in kanban/done/account_device_id_untangle.md.
export async function pairDevice(context: vscode.ExtensionContext): Promise<void> {
  const origin = serverOrigin();

  let identity;
  try {
    identity = await authenticate(context, origin);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Hypergraph: could not reach ${origin} — ${err.message}`);
    return;
  }

  const started = await fetch(`${origin}/device/pair?label=${encodeURIComponent("vscode")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.ticket}` },
  })
    .then((r) => r.json())
    .catch((err) => ({ ok: false, error: err.message })) as {
      ok: boolean; code?: string; path?: string; expiresIn?: number; error?: string;
    };

  if (!started.ok || !started.path || !started.expiresIn) {
    vscode.window.showErrorMessage(`Hypergraph: could not start pairing — ${started.error || "unknown error"}`);
    return;
  }

  await vscode.env.openExternal(vscode.Uri.parse(`${origin}${started.path}`));

  const deadline = Date.now() + started.expiresIn + 5 * 60_000;
  const fingerprint = identity.token.slice(0, 10);

  try {
    const settled = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Hypergraph: approve this device in the browser — key must read ${fingerprint}…`,
        cancellable: true,
      },
      async (_progress, cancel) => {
        while (Date.now() < deadline) {
          if (cancel.isCancellationRequested) return null;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const poll = await fetch(`${origin}/device/pair`, {
            headers: { Authorization: `Bearer ${identity.ticket}` },
          })
            .then((r) => r.json())
            .catch(() => ({})) as { state?: string; account?: string };
          if (poll.state === "paired") return poll;
          if (poll.state === "none") throw new Error("the pairing code expired before it was approved — try again");
        }
        throw new Error("no approval within the pairing window — run this again when you are at the browser");
      },
    );

    if (!settled) return;

    await context.globalState.update(PAIRED_KEY, true);
    await context.globalState.update(ACCOUNT_KEY, settled.account);
    vscode.window.showInformationMessage(
      `Hypergraph: this device joined account ${String(settled.account).slice(0, 8)}`,
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Hypergraph: ${err.message}`);
  }
}

// Offers pairing without forcing it — an anonymous device already owns its
// own world (see the untangle doc), so signing in is an upgrade the user
// opts into, not a gate on using the extension.
export async function promptToPairIfNeeded(context: vscode.ExtensionContext): Promise<void> {
  try {
    if (isPaired(context)) return;
    const choice = await vscode.window.showInformationMessage(
      "Hypergraph: this VS Code window has its own anonymous world. Pair it with your account to reach it from other devices.",
      "Pair device",
      "Not now",
    );
    if (choice === "Pair device") await pairDevice(context);
  } catch (err) {
    // console.error(err);
  }
}
