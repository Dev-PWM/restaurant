"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encodeName,
  parseName,
  parseQuestions,
  buildARecord,
  buildPtrRecord,
  buildSrvRecord,
  buildTxtRecord,
  buildResponsePacket,
  getNetworkInfo,
  createMdnsAdvertiser,
  RECORD_TYPES,
} = require("../shared/realtime/mdns.js");
const {
  createQrMatrix,
  toSvg,
  toDataUri,
} = require("../shared/qrcode.js");
const { createService } = require("../server.js");

/* -------------------------------------------------------------------------- */
/*                               QR Code Tests                                */
/* -------------------------------------------------------------------------- */

test("qrcode: generates valid QR matrix for URLs", () => {
  const matrix = createQrMatrix("http://masaflow.local:3000/pos/", {
    ecLevel: "M",
  });
  assert(matrix.length >= 21, "QR matrix must be at least 21x21");
  assert.equal(matrix.length, matrix[0].length);

  // Position detection patterns must be present at top-left, top-right, bottom-left
  // (7x7 finder patterns have dark border at [0][0], [6][0], [0][6], [6][6])
  assert.equal(Boolean(matrix[0][0]), true);
  assert.equal(Boolean(matrix[6][0]), true);
  assert.equal(Boolean(matrix[0][6]), true);
  assert.equal(Boolean(matrix[6][6]), true);
});

test("qrcode: toSvg produces well-formed scalable vector graphics", () => {
  const url = "http://192.168.1.100:3000/order/";
  const svg = toSvg(url, {
    size: 256,
    margin: 4,
    color: "#000000",
    background: "#ffffff",
  });

  assert(svg.includes("<svg"), "Must have root svg element");
  assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'), "Must specify XMLNS");
  assert(svg.includes('viewBox="0 0'), "Must specify viewBox");
  assert(svg.includes('fill="#ffffff"'), "Must include background rect");
  assert(svg.includes('fill="#000000"'), "Must include dark module path");
  assert(svg.includes('<path d="M'), "Must contain path coordinates");
  assert(svg.endsWith("</svg>"), "Must terminate with svg closing tag");
});

test("qrcode: toDataUri produces valid base64 data URI", () => {
  const dataUri = toDataUri("http://masaflow.local:3000/analytics/");
  assert(
    dataUri.startsWith("data:image/svg+xml;base64,"),
    "Must be a base64 svg data URI",
  );
  const base64Content = dataUri.slice("data:image/svg+xml;base64,".length);
  const decoded = Buffer.from(base64Content, "base64").toString("utf8");
  assert(decoded.includes("<svg"), "Decoded base64 must contain valid SVG");
});

test("qrcode: supports all four error correction levels", () => {
  for (const level of ["L", "M", "Q", "H"]) {
    const matrix = createQrMatrix("MasaFlow POS Local-First Test", {
      ecLevel: level,
    });
    assert(matrix.length >= 21);
    const svg = toSvg("MasaFlow POS Local-First Test", { ecLevel: level });
    assert(svg.includes("<svg"));
  }
});

test("qrcode: handles unicode and special Spanish characters", () => {
  const text = "¡MasaFlow Tacos & Huaraches! $150.00 MXN con quesillo";
  const svg = toSvg(text);
  assert(svg.includes("<svg"));
});

/* -------------------------------------------------------------------------- */
/*                        mDNS Wire Protocol Tests                            */
/* -------------------------------------------------------------------------- */

test("mdns: encodeName and parseName round-trip correctly", () => {
  const domain = "masaflow.local";
  const encoded = encodeName(domain);
  assert(encoded.length > domain.length);

  // Label 1: 8 'masaflow'
  assert.equal(encoded[0], 8);
  assert.equal(encoded.subarray(1, 9).toString("ascii"), "masaflow");
  // Label 2: 5 'local'
  assert.equal(encoded[9], 5);
  assert.equal(encoded.subarray(10, 15).toString("ascii"), "local");
  // Terminating null
  assert.equal(encoded[15], 0);

  const [name, nextOffset] = parseName(encoded, 0);
  assert.equal(name, domain);
  assert.equal(nextOffset, 16);
});

test("mdns: parseQuestions extracts domain name, type, and unicast flag", () => {
  // Construct a standard DNS query packet:
  // ID: 0x0000, Flags: 0x0000, QDCOUNT: 1, ANCOUNT: 0, NSCOUNT: 0, ARCOUNT: 0
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4); // QDCOUNT = 1

  const qname = encodeName("masaflow.local");
  const qtail = Buffer.alloc(4);
  qtail.writeUInt16BE(RECORD_TYPES.A, 0); // QTYPE=1 (A record)
  qtail.writeUInt16BE(0x8001, 2);         // QCLASS=1 (IN) with UNICAST-RESPONSE bit (0x8000)

  const packet = Buffer.concat([header, qname, qtail]);
  const questions = parseQuestions(packet);

  assert.equal(questions.length, 1);
  assert.equal(questions[0].name, "masaflow.local");
  assert.equal(questions[0].type, RECORD_TYPES.A);
  assert.equal(questions[0].unicast, true);
});

test("mdns: buildARecord formats valid IPv4 address record", () => {
  const rec = buildARecord("masaflow.local", "192.168.1.50", 120);
  assert(rec.length > 16);
  const [name, nextOffset] = parseName(rec, 0);
  assert.equal(name, "masaflow.local");

  const rest = rec.subarray(nextOffset);
  const type = rest.readUInt16BE(0);
  const cls = rest.readUInt16BE(2);
  const ttl = rest.readUInt32BE(4);
  const rdlen = rest.readUInt16BE(8);

  assert.equal(type, 1); // Type A
  assert.equal(cls & 0x7fff, 1); // IN
  assert.equal(cls & 0x8000, 0x8000); // Cache flush bit set
  assert.equal(ttl, 120);
  assert.equal(rdlen, 4);
  assert.equal(rest[10], 192);
  assert.equal(rest[11], 168);
  assert.equal(rest[12], 1);
  assert.equal(rest[13], 50);
});

test("mdns: buildPtrRecord formats valid pointer record", () => {
  const rec = buildPtrRecord("_http._tcp.local", "MasaFlow._http._tcp.local", 4500);
  const [name] = parseName(rec, 0);
  assert.equal(name, "_http._tcp.local");
});

test("mdns: buildSrvRecord formats valid service location record", () => {
  const rec = buildSrvRecord("MasaFlow._http._tcp.local", 3000, "masaflow.local", 120);
  const [name, nextOffset] = parseName(rec, 0);
  assert.equal(name, "MasaFlow._http._tcp.local");

  const rest = rec.subarray(nextOffset);
  const type = rest.readUInt16BE(0);
  assert.equal(type, 33); // Type SRV
  const port = rest.readUInt16BE(14);
  assert.equal(port, 3000);
});

test("mdns: buildTxtRecord formats key-value strings", () => {
  const rec = buildTxtRecord("MasaFlow._http._tcp.local", ["path=/pos/", "version=1.0.0"], 4500);
  const [name, nextOffset] = parseName(rec, 0);
  assert.equal(name, "MasaFlow._http._tcp.local");

  const rest = rec.subarray(nextOffset);
  const type = rest.readUInt16BE(0);
  assert.equal(type, 16); // Type TXT
});

test("mdns: buildResponsePacket builds valid DNS response header and sections", () => {
  const aRecord = buildARecord("masaflow.local", "127.0.0.1", 120);
  const packet = buildResponsePacket({ answers: [aRecord], additionals: [] });

  // Header verification:
  const flags = packet.readUInt16BE(2);
  assert.equal((flags >> 15) & 1, 1, "QR bit must be 1 (Response)");
  assert.equal((flags >> 10) & 1, 1, "AA bit must be 1 (Authoritative Answer)");
  assert.equal(packet.readUInt16BE(4), 0, "QDCOUNT must be 0");
  assert.equal(packet.readUInt16BE(6), 1, "ANCOUNT must be 1");
  assert.equal(packet.readUInt16BE(8), 0, "NSCOUNT must be 0");
  assert.equal(packet.readUInt16BE(10), 0, "ARCOUNT must be 0");
});

/* -------------------------------------------------------------------------- */
/*                       Network Diagnostics Tests                            */
/* -------------------------------------------------------------------------- */

test("mdns: getNetworkInfo retrieves system interfaces and URLs", () => {
  const info = getNetworkInfo(3000);
  assert.equal(info.service, "masaflow");
  assert(typeof info.bonjourHost === "string" && info.bonjourHost.length > 0);
  assert(info.hostnames.bonjour.endsWith(".local"));
  assert.equal(info.hostnames.mdns, "masaflow.local");
  assert.equal(info.port, 3000);
  assert(Array.isArray(info.interfaces));
  assert(info.urls.localhost.includes("3000"));
  assert(info.urls.bonjour.includes(".local:3000"));
  assert(info.urls.mdns.includes("masaflow.local:3000"));
  assert(info.urls.pos.endsWith("/pos/"));
});

test("mdns: createMdnsAdvertiser starts and stops without leaking sockets", async () => {
  const advertiser = createMdnsAdvertiser({
    port: 39999,
    hostname: "test-station",
  });
  // Closing must be completely clean and idempotent
  await advertiser.close();
  await advertiser.close();
});

/* -------------------------------------------------------------------------- */
/*                     Server HTTP API Integration Tests                      */
/* -------------------------------------------------------------------------- */

test("server api: GET /api/network returns JSON diagnostic telemetry", async () => {
  const service = await createService({
    port: 0,
    enableMdns: false,
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const port = service.server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/network`);
    assert.equal(res.status, 200);
    assert(res.headers.get("content-type")?.includes("application/json"));

    const data = await res.json();
    assert.equal(data.service, "masaflow");
    assert.equal(data.port, port);
    assert(typeof data.bonjourHost === "string");
    assert(data.hostnames.bonjour.endsWith(".local"));
    assert.equal(data.hostnames.mdns, "masaflow.local");
    assert(data.urls.localhost.includes(String(port)));
    assert(data.urls.bonjour.includes(String(port)));
    assert(data.urls.mdns.includes(String(port)));
  } finally {
    await service.close();
  }
});

test("server api: GET /api/network/qr returns vector SVG or JSON data URI", async () => {
  const service = await createService({
    port: 0,
    enableMdns: false,
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const port = service.server.address().port;

  try {
    // 1. Default format: SVG image for target=order
    const svgRes = await fetch(
      `http://127.0.0.1:${port}/api/network/qr?target=order`,
    );
    assert.equal(svgRes.status, 200);
    assert(svgRes.headers.get("content-type")?.includes("image/svg+xml"));
    assert.equal(svgRes.headers.get("cache-control"), "no-cache");
    const svgBody = await svgRes.text();
    assert(svgBody.includes("<svg"));
    assert(svgBody.includes("</svg>"));

    // 2. Format JSON: returns Data URI and target URL
    const jsonRes = await fetch(
      `http://127.0.0.1:${port}/api/network/qr?target=pos&format=json`,
    );
    assert.equal(jsonRes.status, 200);
    assert(jsonRes.headers.get("content-type")?.includes("application/json"));
    const jsonData = await jsonRes.json();
    assert(jsonData.url.endsWith("/pos/"));
    assert(jsonData.dataUri.startsWith("data:image/svg+xml;base64,"));
  } finally {
    await service.close();
  }
});
