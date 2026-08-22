#!/usr/bin/env node
/**
 * Deploy the GhostDeal escrow helper to Starknet (Sepolia by default).
 *
 * The deployer account is a plain JSON key file that must NEVER be committed:
 *   { "address": "0x..", "private_key": "0x..", "salt": "0x..", "oz_class": "0x.." }
 * `salt` and `oz_class` are only needed the first time, to deploy the account itself.
 *
 * Usage:
 *   node scripts/deploy-escrow.mjs ./deployer.json                      # Sepolia
 *   node scripts/deploy-escrow.mjs ./deployer.json --network mainnet
 *   node scripts/deploy-escrow.mjs ./deployer.json --pool 0x..          # override pool
 *
 * Prerequisites:
 *   - cairo/target/dev artifacts: run `scarb build` inside cairo/
 *   - NEXT_PUBLIC_PROVIDER_URL (Alchemy key) in .env.local, or RPC_URL in env
 */
import { Account, CallData, RpcProvider, ec, hash } from "starknet";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const NETWORKS = {
  sepolia: {
    rpc: (key) => `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${key}`,
    pool: "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
    envName: "NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA",
    explorer: "sepolia.voyager",
  },
  mainnet: {
    rpc: (key) => `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${key}`,
    pool: "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
    envName: "NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET",
    explorer: "voyager",
  },
};

// Universal Deployer Contract (same address on all Starknet networks).
const UDC = "0x02ceed65a4bd731034c01113685c831b01c15d7d432f71afb1cf1634b53a2125";

// Fee caps: auto-estimation can overshoot the deployer balance, and Sepolia
// declares currently validate with ~140M l2 gas (≈6.5 STRK of bounds at max
// price). 10 STRK budget covers declare and invoke with headroom; the actual
// charge is for real usage only, well below the bound.
const L2_GAS_PRICE = 46066489617n;
const L1_DATA_GAS_PRICE = 1159364029035n;
const L1_GAS_PRICE = 277366125278392n;

function feeBounds(maxFeeStrk = 10) {
  const budget = BigInt(Math.round(maxFeeStrk * 1e18));
  return {
    l1_gas: { max_amount: 0n, max_price_per_unit: L1_GAS_PRICE },
    l2_gas: { max_amount: (budget * 9n) / 10n / L2_GAS_PRICE, max_price_per_unit: L2_GAS_PRICE },
    l1_data_gas: { max_amount: 512n, max_price_per_unit: L1_DATA_GAS_PRICE },
  };
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const [accountFile, ...rest] = process.argv.slice(2);
  if (!accountFile) {
    fail("Usage: node scripts/deploy-escrow.mjs <account.json> [--network sepolia|mainnet] [--pool 0x..]");
  }
  const args = { accountFile, network: "sepolia", pool: undefined };
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === "--network") args.network = rest[i + 1];
    if (rest[i] === "--pool") args.pool = rest[i + 1];
  }
  if (!NETWORKS[args.network]) fail(`Unknown network: ${args.network}`);
  return args;
}

function resolveRpc(network) {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  const envPath = join(ROOT, ".env.local");
  if (existsSync(envPath)) {
    const key = readFileSync(envPath, "utf8").match(/^NEXT_PUBLIC_PROVIDER_URL=(.+)$/m)?.[1]?.trim();
    if (key) return NETWORKS[network].rpc(key);
  }
  fail("No RPC available: set RPC_URL or NEXT_PUBLIC_PROVIDER_URL (Alchemy key) in .env.local");
}

function randomSalt() {
  return "0x" + [...crypto.getRandomValues(new Uint8Array(31))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isDeployed(provider, address) {
  try {
    await provider.getClassAt(address);
    return true;
  } catch {
    return false;
  }
}

async function waitTx(provider, txHash, label) {
  console.log(`  waiting for ${label}: ${txHash}`);
  const receipt = await provider.waitForTransaction(txHash);
  if (receipt.execution_status && receipt.execution_status !== "SUCCEEDED") {
    fail(`${label} reverted (${receipt.execution_status}). See hash ${txHash}`);
  }
  console.log(`  ${label} accepted.`);
}

const { accountFile, network, pool: poolOverride } = parseArgs();
const net = NETWORKS[network];
const pool = poolOverride ?? net.pool;
if (network === "mainnet") {
  console.log("⚠ MAINNET: this spends real STRK and the deploy is public. Continue only after Sepolia testing.");
}

// 1. Provider + deployer account
const provider = new RpcProvider({ nodeUrl: resolveRpc(network) });
const keys = JSON.parse(readFileSync(accountFile, "utf8"));
if (!keys.address || !keys.private_key) fail("account.json needs at least { address, private_key }");
const account = new Account({ provider, address: keys.address, signer: keys.private_key });
const publicKey = keys.public_key ?? ec.starkCurve.getStarkKey(keys.private_key);

// 2. Deploy the account itself if needed (first run only)
if (!(await isDeployed(provider, keys.address))) {
  if (!keys.salt || !keys.oz_class) {
    fail(
      `Account ${keys.address} is not deployed yet and the key file lacks { salt, oz_class }.\n` +
        `Fund it first (it pays its own deploy fee): ${keys.address}`,
    );
  }
  console.log("• Deploying the deployer account (OpenZeppelin)…");
  try {
    const { transaction_hash } = await account.deployAccount({
      classHash: keys.oz_class,
      constructorCalldata: CallData.compile({ publicKey }),
      addressSalt: keys.salt,
      contractAddress: keys.address,
    });
    await waitTx(provider, transaction_hash, "account deploy");
  } catch (e) {
    fail(
      `Account deploy failed (is ${keys.address} funded with STRK for gas?)\n${String(e.message).slice(0, 300)}`,
    );
  }
}

// 3. Load the compiled escrow, then declare the class if needed
const sierraPath = join(ROOT, "cairo", "target", "dev", "ghostdeal_escrow_Escrow.contract_class.json");
const casmPath = join(ROOT, "cairo", "target", "dev", "ghostdeal_escrow_Escrow.compiled_contract_class.json");
if (!existsSync(sierraPath) || !existsSync(casmPath)) {
  fail("Compiled contract not found. Run `scarb build` inside cairo/ first.");
}
const sierra = JSON.parse(readFileSync(sierraPath, "utf8"));
const casm = JSON.parse(readFileSync(casmPath, "utf8"));

let classHash = hash.computeContractClassHash(sierra);
try {
  await provider.getClass(classHash);
  console.log(`• Escrow class already declared: ${classHash}`);
} catch {
  console.log("• Declaring escrow class…");
  const resp = await account.declare({ contract: sierra, casm }, { resourceBounds: feeBounds() });
  await waitTx(provider, resp.transaction_hash, "declare");
  classHash = resp.class_hash;
}

// 4. Deploy the escrow through the UDC (manual calldata: class, salt, unique=0, len, args)
const salt = randomSalt();
const constructorCalldata = [pool]; // Escrow constructor: privacy_contract: ContractAddress
console.log("• Deploying escrow via UDC…");
const { transaction_hash } = await account.execute(
  {
    contractAddress: UDC,
    entrypoint: "deployContract",
    calldata: [classHash, salt, "0x0", String(constructorCalldata.length), ...constructorCalldata],
  },
  { resourceBounds: feeBounds() },
);
await waitTx(provider, transaction_hash, "escrow deploy");

// The authoritative address comes from the UDC's ContractDeployed event —
// precomputing it by hand is easy to get wrong (unique flag / deployer rules).
const receipt = await provider.getTransactionReceipt(transaction_hash);
const ev = (receipt.events ?? []).find((e) => (e.data ?? []).some((d) => BigInt(d) === BigInt(classHash)));
if (!ev) fail("UDC deploy accepted but no ContractDeployed event found in the receipt");
const expected = String(ev.data[0]);

console.log("\n✓ GhostDeal escrow deployed");
console.log(`  network:      ${network}`);
console.log(`  escrow:       ${expected}`);
console.log(`  class hash:   ${classHash}`);
console.log(`  privacy pool: ${pool}`);
console.log(`\nAdd to .env.local:`);
console.log(`  ${net.envName}=${expected}`);
console.log(`Explorer: https://${net.explorer}.online/contract/${expected}`);
