import * as vscode from "vscode";
import { AccountIdentity, authenticate, Identity } from "./identity";
import { log } from "./log";

let inFlight: Promise<AccountIdentity> | null = null;

export function requireAccount(context: vscode.ExtensionContext, origin: string): Promise<AccountIdentity> {
  if (!inFlight) {
    inFlight = resolveAccount(context, origin).finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function resolveAccount(context: vscode.ExtensionContext, origin: string): Promise<AccountIdentity> {
  const identity = await authenticate(context, origin);
  if (identity.account) {
    log(`device ${identity.token.slice(0, 10)} is on account ${identity.account.slice(0, 8)}`);
    return { ...identity, account: identity.account };
  }
  const account = await pairDevice(origin, identity);
  return { ...identity, account };
}

async function pairDevice(origin: string, identity: Identity): Promise<string> {
  const started = await fetch(`${origin}/device/pair?label=${encodeURIComponent("vscode")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.ticket}` },
  })
    .then((r) => r.json())
    .catch((err) => ({ ok: false, error: err.message })) as {
      ok: boolean; path?: string; expiresIn?: number; error?: string;
    };

  if (!started.ok || !started.path || !started.expiresIn) {
    throw new Error(`could not start pairing — ${started.error || "unknown error"}`);
  }

  await vscode.env.openExternal(vscode.Uri.parse(`${origin}${started.path}`));

  const deadline = Date.now() + started.expiresIn + 5 * 60_000;
  const fingerprint = identity.token.slice(0, 10);

  const account = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Hypergraph: approve this device in the browser — key must read ${fingerprint}…`,
      cancellable: true,
    },
    async (_progress, cancel) => {
      while (Date.now() < deadline) {
        if (cancel.isCancellationRequested) throw new Error("pairing cancelled — this device has no account");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const poll = await fetch(`${origin}/device/pair`, {
          headers: { Authorization: `Bearer ${identity.ticket}` },
        })
          .then((r) => r.json())
          .catch(() => ({})) as { state?: string; account?: string };
        if (poll.state === "paired" && poll.account) return poll.account;
        if (poll.state === "none") throw new Error("the pairing code expired before it was approved — try again");
      }
      throw new Error("no approval within the pairing window — try again when you are at the browser");
    },
  );

  vscode.window.showInformationMessage(`Hypergraph: this device joined account ${account.slice(0, 8)}`);
  return account;
}
