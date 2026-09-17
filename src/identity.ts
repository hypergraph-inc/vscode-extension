import { Buffer } from "node:buffer";
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { log, logError } from "./log";

const SECRET_KEY = "hypergraph.deviceKey";

export interface Identity {
  token: string;
  ticket: string;
  pubkey: string;
  account: string | null;
}

export interface AccountIdentity extends Identity {
  account: string;
}

const REFRESH_MS = 7 * 60 * 1000;
const RETRY_MS = 1 * 60 * 1000;

export function serveIdentity(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  origin: string,
  onDetached: () => void,
): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let warned = false;
  let stopped = false;

  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = stopped ? undefined : setTimeout(() => { void push(); }, ms);
  };

  const push = async () => {
    try {
      const identity = await authenticate(context, origin);
      if (!identity.account) {
        logError(`serveIdentity: device ${identity.token.slice(0, 10)} is no longer on an account`);
        stopped = true;
        onDetached();
        return;
      }
      await webview.postMessage({
        type: "hypergraph.identity",
        ticket: identity.ticket,
        token: identity.account,
      });
      log(`serveIdentity: pushed refreshed identity to webview for ${origin}`);
      failures = 0;
      warned = false;
    } catch (err) {
      failures += 1;
      logError(`serveIdentity: push failed for ${origin} (failure #${failures})`, err);
      if (failures >= 2 && !warned) {
        warned = true;
        vscode.window.showWarningMessage(
          `Hypergraph: cannot reach ${origin} to refresh this view's ticket — it is running signed out until the connection comes back.`,
        );
      }
    }
    arm(failures ? RETRY_MS : REFRESH_MS);
  };

  arm(REFRESH_MS);

  const listener = webview.onDidReceiveMessage((msg) => {
    if (msg && msg.type === "hypergraph.identity.request") void push();
    if (msg && msg.type === "hypergraph.debug") log(`webview: ${msg.message}`);
  });

  return new vscode.Disposable(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
    listener.dispose();
  });
}

async function loadOrMintKeyPair(context: vscode.ExtensionContext) {
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored) {
    const jwk = JSON.parse(stored);
    const privateKey = crypto.createPrivateKey({ key: jwk, format: "jwk" });
    return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  await context.secrets.store(SECRET_KEY, JSON.stringify(privateKey.export({ format: "jwk" })));
  return { privateKey, publicKey };
}

function pubkeyHex(publicKey: crypto.KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  return Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("hex");
}

export async function forgetDeviceKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
}

export async function authenticate(context: vscode.ExtensionContext, origin: string): Promise<Identity> {
  const { privateKey, publicKey } = await loadOrMintKeyPair(context);
  const pubkey = pubkeyHex(publicKey);

  const cr = await fetch(`${origin}/identity/challenge?pubkey=${encodeURIComponent(pubkey)}`, { method: "POST" });
  const challenge = (await cr.json()) as { ok: boolean; challenge: string; error?: string };
  if (!challenge.ok) throw new Error(`identity: challenge refused (${challenge.error})`);

  const signature = crypto
    .sign("sha256", Buffer.from(challenge.challenge, "utf8"), { key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("hex");

  const ar = await fetch(`${origin}/identity/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: challenge.challenge, pubkey, signature, kind: "device" }),
  });
  const answer = (await ar.json()) as {
    ok: boolean; token: string; ticket: string; account?: string | null; error?: string;
  };
  if (!answer.ok) throw new Error(`identity: authentication refused (${answer.error})`);
  if (!answer.token || !answer.ticket) throw new Error("identity: server accepted the key but sent no token or ticket");

  return { token: answer.token, ticket: answer.ticket, pubkey, account: answer.account || null };
}
