import { Buffer } from "node:buffer";
import * as crypto from "node:crypto";
import * as vscode from "vscode";

const SECRET_KEY = "hypergraph.deviceKey";

export interface Identity {
  token: string;
  ticket: string;
  pubkey: string;
}

const REFRESH_MS = 7 * 60 * 1000;
const RETRY_MS = 1 * 60 * 1000;

export function serveIdentity(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  origin: string,
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
      await webview.postMessage({
        type: "hypergraph.identity",
        ticket: identity.ticket,
        token: identity.token,
      });
      failures = 0;
      warned = false;
    } catch {
      failures += 1;
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

// The VS Code extension host has no passkey access, so it authenticates the
// same way the companion CLI does: an ephemeral device keypair signs a
// server-issued challenge. The resulting token is a device identity — see
// server/account-store.mjs's KIND_DEVICE — which starts out owning its own
// anonymous world and only becomes part of the user's account once paired
// through /device/pair (see pairing.ts).
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
  const answer = (await ar.json()) as { ok: boolean; token: string; ticket: string; error?: string };
  if (!answer.ok) throw new Error(`identity: authentication refused (${answer.error})`);

  return { token: answer.token, ticket: answer.ticket, pubkey };
}
