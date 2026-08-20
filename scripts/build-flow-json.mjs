#!/usr/bin/env node
/**
 * Builds flows/order-flow.json from flows/order-flow.template.json by encoding
 * the banner and the two selection-list icons as Base64 and injecting them in
 * place of the __ASSET_*__ tokens (WhatsApp Flow images must be Base64).
 *
 * Real artwork wins when present: drop banner.png / icon-search.png /
 * icon-marketplace.png into flows/assets/ and they are used verbatim.
 * Otherwise small, valid, brand-emerald PNG placeholders are generated so the
 * Flow is always uploadable without binary assets in the repo.
 *
 *   node scripts/build-flow-json.mjs        # writes flows/order-flow.json
 *   node scripts/build-flow-json.mjs --check # verify it is up to date (CI)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "flows", "order-flow.template.json");
const OUTPUT = path.join(ROOT, "flows", "order-flow.json");
const ASSET_DIR = path.join(ROOT, "flows", "assets");

// ---- Minimal PNG encoder (solid colour) — no external dependencies ---------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** A solid-colour RGB PNG of the given size. */
function solidPng(width, height, [r, g, b]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // 10-12: compression / filter / interlace = 0
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Loads a real asset PNG if present, else generates a brand placeholder. */
function assetBase64(fileName, generate) {
  const file = path.join(ASSET_DIR, fileName);
  const bytes = existsSync(file) ? readFileSync(file) : generate();
  return { base64: bytes.toString("base64"), fromDisk: existsSync(file), bytes };
}

// Confirmly brand emerald/teal.
const EMERALD = [5, 150, 105]; // #059669
const EMERALD_LIGHT = [16, 185, 129]; // #10b981
const TEAL_DARK = [4, 120, 87]; // #047857

const assets = {
  __ASSET_BANNER__: assetBase64("banner.png", () => solidPng(640, 320, EMERALD)),
  __ASSET_ICON_SEARCH__: assetBase64("icon-search.png", () =>
    solidPng(96, 96, EMERALD_LIGHT)
  ),
  __ASSET_ICON_MARKETPLACE__: assetBase64("icon-marketplace.png", () =>
    solidPng(96, 96, TEAL_DARK)
  ),
};

/** Recursively drops human-only "//" comment keys the uploader would reject. */
function stripComments(value) {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === "//") continue;
      out[key] = stripComments(val);
    }
    return out;
  }
  return value;
}

function build() {
  let template = readFileSync(TEMPLATE, "utf8");
  for (const [token, asset] of Object.entries(assets)) {
    if (!template.includes(token)) {
      throw new Error(`template is missing token ${token}`);
    }
    template = template.split(token).join(asset.base64);
  }
  const parsed = stripComments(JSON.parse(template));
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

const output = build();
const check = process.argv.includes("--check");

if (check) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (current !== output) {
    console.error(
      "flows/order-flow.json is out of date. Run: npm run flow:build"
    );
    process.exit(1);
  }
  console.log("flows/order-flow.json is up to date.");
} else {
  writeFileSync(OUTPUT, output);
  const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${kib(output.length)})`);
  for (const [token, asset] of Object.entries(assets)) {
    console.log(
      `  ${token}: ${asset.fromDisk ? "asset file" : "generated"} ${kib(asset.bytes.length)}`
    );
  }
}
