// @ts-check
"use strict";

const dgram = require("node:dgram");
const os = require("node:os");
const { execSync, spawn } = require("node:child_process");

const MULTICAST_IPV4 = "224.0.0.251";
const MDNS_PORT = 5353;

const RECORD_TYPES = {
  A: 1,
  PTR: 12,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  ANY: 255,
};

/**
 * Returns the Bonjour / local hostname of the machine.
 * On macOS, scutil --get LocalHostName gives the exact Bonjour identifier.
 * @returns {string} e.g. "macs-MacBook-Pro"
 */
function getLocalHostName() {
  if (process.platform === "darwin") {
    try {
      const output = execSync("scutil --get LocalHostName", {
        encoding: "utf8",
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (output) return output;
    } catch {}
  }
  return os
    .hostname()
    .replace(/\.(local|lan|home|internal)$/i, "")
    .trim();
}

/**
 * Collects non-internal IPv4 LAN addresses from host network interfaces.
 * @returns {{ name: string, address: string, internal: boolean }[]}
 */
function getLanInterfaces() {
  const interfaces = os.networkInterfaces();
  /** @type {{ name: string, address: string, internal: boolean }[]} */
  const results = [];
  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === "IPv4" && !net.internal) {
        results.push({ name, address: net.address, internal: false });
      }
    }
  }
  // Sort prioritizing standard WiFi / Ethernet interface names (en0, eth0, wlan0)
  results.sort((a, b) => {
    const score = (/** @type {string} */ name) =>
      /^(en0|eth0|wlan0)/i.test(name)
        ? 0
        : /^(en|eth|wlan)/i.test(name)
          ? 1
          : 2;
    return score(a.name) - score(b.name);
  });
  return results;
}

/**
 * Encodes a DNS domain name into wire format (RFC 1035).
 * e.g. "masaflow.local" -> \x08masaflow\x05local\x00
 * @param {string} name
 * @returns {Buffer}
 */
function encodeName(name) {
  const parts = name.split(".").filter(Boolean);
  const bufs = [];
  for (const part of parts) {
    const b = Buffer.from(part, "utf8");
    bufs.push(Buffer.from([b.length]), b);
  }
  bufs.push(Buffer.from([0]));
  return Buffer.concat(bufs);
}

/**
 * Decodes a DNS domain name from wire format, handling compression pointers.
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {[string, number]} [decodedName, nextOffset]
 */
function parseName(buf, offset) {
  const parts = [];
  let curr = offset;
  let jumped = false;
  let endOffset = offset;
  let count = 0;
  while (curr < buf.length && count++ < 60) {
    const len = buf[curr++];
    if (len === 0) break;
    if ((len & 0xc0) === 0xc0) {
      if (!jumped) endOffset = curr + 1;
      jumped = true;
      curr = ((len & 0x3f) << 8) | buf[curr++];
      continue;
    }
    parts.push(buf.subarray(curr, curr + len).toString("utf8"));
    curr += len;
  }
  return [parts.join("."), jumped ? endOffset : curr];
}

/**
 * Parses DNS questions from a packet buffer.
 * @param {Buffer} buf
 * @returns {{ name: string, type: number, class: number, unicast: boolean }[]}
 */
function parseQuestions(buf) {
  if (buf.length < 12) return [];
  const qdCount = buf.readUInt16BE(4);
  let offset = 12;
  const questions = [];
  for (let i = 0; i < qdCount; i++) {
    if (offset >= buf.length) break;
    const [name, nextOffset] = parseName(buf, offset);
    if (nextOffset + 4 > buf.length) break;
    const type = buf.readUInt16BE(nextOffset);
    const qclass = buf.readUInt16BE(nextOffset + 2);
    questions.push({
      name,
      type,
      class: qclass & 0x7fff,
      unicast: Boolean(qclass & 0x8000),
    });
    offset = nextOffset + 4;
  }
  return questions;
}

/**
 * Builds a Resource Record buffer.
 * @param {string} name
 * @param {number} type
 * @param {number} ttl
 * @param {Buffer} rdata
 * @param {boolean} [flush=true]
 * @returns {Buffer}
 */
function buildRecord(name, type, ttl, rdata, flush = true) {
  const nameBuf = encodeName(name);
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(flush ? 0x8001 : 0x0001, 2); // Class IN with cache-flush bit
  header.writeUInt32BE(ttl, 4);
  header.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([nameBuf, header, rdata]);
}

/**
 * Builds an IPv4 A record.
 * @param {string} name
 * @param {string} ip
 * @param {number} [ttl=120]
 * @returns {Buffer}
 */
function buildARecord(name, ip, ttl = 120) {
  const parts = ip.split(".").map(Number);
  return buildRecord(name, RECORD_TYPES.A, ttl, Buffer.from(parts), true);
}

/**
 * Builds a PTR record.
 * @param {string} name
 * @param {string} target
 * @param {number} [ttl=4500]
 * @returns {Buffer}
 */
function buildPtrRecord(name, target, ttl = 4500) {
  return buildRecord(
    name,
    RECORD_TYPES.PTR,
    ttl,
    encodeName(target),
    false, // PTR records do not set cache-flush bit so multiple service instances coexist
  );
}

/**
 * Builds an SRV record.
 * @param {string} name
 * @param {number} port
 * @param {string} target
 * @param {number} [ttl=4500]
 * @returns {Buffer}
 */
function buildSrvRecord(name, port, target, ttl = 4500) {
  const targetBuf = encodeName(target);
  const rdata = Buffer.alloc(6 + targetBuf.length);
  rdata.writeUInt16BE(0, 0); // Priority
  rdata.writeUInt16BE(0, 2); // Weight
  rdata.writeUInt16BE(port, 4); // Port
  targetBuf.copy(rdata, 6);
  return buildRecord(name, RECORD_TYPES.SRV, ttl, rdata, true);
}

/**
 * Builds a TXT record from key-value pairs.
 * @param {string} name
 * @param {Record<string, string>} entries
 * @param {number} [ttl=4500]
 * @returns {Buffer}
 */
function buildTxtRecord(name, entries, ttl = 4500) {
  const bufs = [];
  for (const [k, v] of Object.entries(entries)) {
    const str = `${k}=${v}`;
    const b = Buffer.from(str, "utf8");
    bufs.push(Buffer.from([b.length]), b);
  }
  const rdata = bufs.length ? Buffer.concat(bufs) : Buffer.from([0]);
  return buildRecord(name, RECORD_TYPES.TXT, ttl, rdata, true);
}

/**
 * Assembles a complete DNS response packet.
 * @param {{ id?: number, answers: Buffer[], additionals?: Buffer[] }} options
 * @returns {Buffer}
 */
function buildResponsePacket({ id = 0, answers, additionals = [] }) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8400, 2); // Response, Authoritative
  header.writeUInt16BE(0, 4); // Questions = 0
  header.writeUInt16BE(answers.length, 6); // Answer count
  header.writeUInt16BE(0, 8); // Authority count = 0
  header.writeUInt16BE(additionals.length, 10); // Additional count
  return Buffer.concat([header, ...answers, ...additionals]);
}

/**
 * Comprehensive network info descriptor.
 * @param {number} port
 */
function getNetworkInfo(port) {
  const interfaces = getLanInterfaces();
  const bonjourHost = getLocalHostName();
  const primaryIp = interfaces[0]?.address || "127.0.0.1";

  const hostnames = {
    bonjour: `${bonjourHost}.local`,
    mdns: "masaflow.local",
    lan: primaryIp,
  };

  const urls = {
    bonjour: `http://${hostnames.bonjour}:${port}`,
    mdns: `http://${hostnames.mdns}:${port}`,
    lan: `http://${hostnames.lan}:${port}`,
    localhost: `http://localhost:${port}`,
    pos: `http://${hostnames.bonjour}:${port}/pos/`,
    order: `http://${hostnames.bonjour}:${port}/order/`,
    analytics: `http://${hostnames.bonjour}:${port}/analytics/`,
  };

  return {
    service: "masaflow",
    version: "0.3.0",
    restaurant: "Los Huaraches de Zapata",
    port,
    bonjourHost,
    primaryIp,
    hostnames,
    urls,
    interfaces,
    active: true,
  };
}

/**
 * Starts Multicast DNS (RFC 6762 / 6763) advertising and companion Bonjour registration.
 *
 * @param {{
 *   port: number,
 *   logger?: { info: (obj: unknown, msg: string) => void, error: (obj: unknown, msg: string) => void, warn: (obj: unknown, msg: string) => void },
 *   instanceName?: string,
 *   serviceType?: string,
 * }} options
 */
function createMdnsAdvertiser(options) {
  const port = options.port;
  const log = options.logger || console;
  const instanceName =
    options.instanceName || "MasaFlow - Los Huaraches de Zapata";
  const bonjourHost = getLocalHostName();
  const hostFqdn = `${bonjourHost}.local`;
  const mdnsFqdn = "masaflow.local";

  const txtData = {
    path: "/pos/",
    orderPath: "/order/",
    service: "masaflow",
    version: "0.3.0",
    restaurant: "Los Huaraches de Zapata",
    role: "pos-hub",
  };

  /** @type {dgram.Socket | null} */
  let socket = null;
  /** @type {import('node:child_process').ChildProcess | null} */
  let companionProcess = null;
  /** @type {NodeJS.Timeout | null} */
  let ifaceTimer = null;
  let closed = false;

  let currentIp = getLanInterfaces()[0]?.address || "127.0.0.1";

  /**
   * Generates all answer and additional records for an announcement or response.
   * @param {number} [ttlA]
   * @param {number} [ttlService]
   */
  function getRecords(ttlA = 120, ttlService = 4500) {
    const aRecordPrimary = buildARecord(mdnsFqdn, currentIp, ttlA);
    const aRecordBonjour = buildARecord(hostFqdn, currentIp, ttlA);

    const ptrHttp = buildPtrRecord(
      "_http._tcp.local",
      `${instanceName}._http._tcp.local`,
      ttlService,
    );
    const srvHttp = buildSrvRecord(
      `${instanceName}._http._tcp.local`,
      port,
      mdnsFqdn,
      ttlService,
    );
    const txtHttp = buildTxtRecord(
      `${instanceName}._http._tcp.local`,
      txtData,
      ttlService,
    );

    const ptrMasa = buildPtrRecord(
      "_masaflow._tcp.local",
      `${instanceName}._masaflow._tcp.local`,
      ttlService,
    );
    const srvMasa = buildSrvRecord(
      `${instanceName}._masaflow._tcp.local`,
      port,
      mdnsFqdn,
      ttlService,
    );
    const txtMasa = buildTxtRecord(
      `${instanceName}._masaflow._tcp.local`,
      txtData,
      ttlService,
    );

    return {
      aRecordPrimary,
      aRecordBonjour,
      ptrHttp,
      srvHttp,
      txtHttp,
      ptrMasa,
      srvMasa,
      txtMasa,
    };
  }

  /**
   * Broadcasts gratuitous mDNS announcement packet to the local network.
   * @param {number} [ttlA=120]
   * @param {number} [ttlService=4500]
   */
  function broadcastAnnouncement(ttlA = 120, ttlService = 4500) {
    if (!socket || closed) return;
    try {
      const recs = getRecords(ttlA, ttlService);
      const packet = buildResponsePacket({
        answers: [
          recs.aRecordPrimary,
          recs.aRecordBonjour,
          recs.ptrHttp,
          recs.ptrMasa,
        ],
        additionals: [
          recs.srvHttp,
          recs.txtHttp,
          recs.srvMasa,
          recs.txtMasa,
        ],
      });
      socket.send(packet, 0, packet.length, MDNS_PORT, MULTICAST_IPV4);
    } catch {}
  }

  /**
   * Sends goodbye packet with TTL=0 to evict cached records from all clients.
   */
  function broadcastGoodbye() {
    broadcastAnnouncement(0, 0);
  }

  // 1. Initialize Pure Node.js UDP Multicast Responder on 224.0.0.251:5353
  try {
    socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    socket.on("error", (err) => {
      // Don't crash server if port 5353 has local network restrictions
      log.warn({ err: err.message }, "mDNS UDP listener notice");
    });

    socket.on("message", (msg, rinfo) => {
      if (closed || msg.length < 12) return;
      const flags = msg.readUInt16BE(2);
      const isQuery = (flags & 0x8000) === 0;
      if (!isQuery) return;

      const questions = parseQuestions(msg);
      if (!questions.length) return;

      const recs = getRecords();
      /** @type {Buffer[]} */
      const answers = [];
      /** @type {Buffer[]} */
      const additionals = [];

      let unicastRequested = false;

      for (const q of questions) {
        if (q.unicast) unicastRequested = true;
        const qName = q.name.toLowerCase();
        const qType = q.type;

        // A Record queries for masaflow.local or <host>.local
        if (
          (qName === mdnsFqdn || qName === hostFqdn.toLowerCase()) &&
          (qType === RECORD_TYPES.A || qType === RECORD_TYPES.ANY)
        ) {
          answers.push(
            qName === mdnsFqdn ? recs.aRecordPrimary : recs.aRecordBonjour,
          );
        }

        // Service discovery queries: _http._tcp.local or _masaflow._tcp.local
        if (
          qName === "_http._tcp.local" &&
          (qType === RECORD_TYPES.PTR || qType === RECORD_TYPES.ANY)
        ) {
          answers.push(recs.ptrHttp);
          additionals.push(recs.srvHttp, recs.txtHttp, recs.aRecordPrimary);
        }
        if (
          qName === "_masaflow._tcp.local" &&
          (qType === RECORD_TYPES.PTR || qType === RECORD_TYPES.ANY)
        ) {
          answers.push(recs.ptrMasa);
          additionals.push(recs.srvMasa, recs.txtMasa, recs.aRecordPrimary);
        }

        // Service instance queries
        if (
          qName === `${instanceName}._http._tcp.local`.toLowerCase() &&
          (qType === RECORD_TYPES.SRV ||
            qType === RECORD_TYPES.TXT ||
            qType === RECORD_TYPES.ANY)
        ) {
          if (qType === RECORD_TYPES.SRV || qType === RECORD_TYPES.ANY)
            answers.push(recs.srvHttp);
          if (qType === RECORD_TYPES.TXT || qType === RECORD_TYPES.ANY)
            answers.push(recs.txtHttp);
          additionals.push(recs.aRecordPrimary);
        }
        if (
          qName === `${instanceName}._masaflow._tcp.local`.toLowerCase() &&
          (qType === RECORD_TYPES.SRV ||
            qType === RECORD_TYPES.TXT ||
            qType === RECORD_TYPES.ANY)
        ) {
          if (qType === RECORD_TYPES.SRV || qType === RECORD_TYPES.ANY)
            answers.push(recs.srvMasa);
          if (qType === RECORD_TYPES.TXT || qType === RECORD_TYPES.ANY)
            answers.push(recs.txtMasa);
          additionals.push(recs.aRecordPrimary);
        }
      }

      if (!answers.length) return;

      const response = buildResponsePacket({
        id: msg.readUInt16BE(0),
        answers,
        additionals,
      });

      try {
        if (socket) {
          if (unicastRequested && rinfo.port !== MDNS_PORT) {
            socket.send(response, 0, response.length, rinfo.port, rinfo.address);
          } else {
            socket.send(response, 0, response.length, MDNS_PORT, MULTICAST_IPV4);
          }
        }
      } catch {}
    });

    socket.bind(MDNS_PORT, () => {
      try {
        socket?.addMembership(MULTICAST_IPV4);
        socket?.setMulticastTTL(255);
        socket?.setMulticastLoopback(true);

        // Send two bursts of gratuitous announcements 1000ms apart (RFC 6762 §8.3)
        broadcastAnnouncement();
        setTimeout(() => broadcastAnnouncement(), 1000);
      } catch (err) {
        log.warn({ err: /** @type {Error} */ (err).message }, "mDNS group join notice");
      }
    });
  } catch (err) {
    log.warn({ err: /** @type {Error} */ (err).message }, "mDNS initialization bypassed");
  }

  // 2. Register with Native macOS Bonjour (dns-sd) if running on Darwin
  if (process.platform === "darwin") {
    try {
      companionProcess = spawn(
        "/usr/bin/dns-sd",
        [
          "-R",
          instanceName,
          "_http._tcp",
          "local",
          String(port),
          "path=/pos/",
          "service=masaflow",
          "version=0.3.0",
        ],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
      companionProcess.on("error", () => {
        companionProcess = null;
      });
      companionProcess.unref();
    } catch {}
  }

  // 3. Periodic network interface monitor (detects DHCP renewals during service)
  ifaceTimer = setInterval(() => {
    if (closed) return;
    const latestIp = getLanInterfaces()[0]?.address || "127.0.0.1";
    if (latestIp !== currentIp) {
      log.info(
        { from: currentIp, to: latestIp },
        "Dirección IP local actualizada por DHCP. Reanunciando mDNS.",
      );
      currentIp = latestIp;
      broadcastAnnouncement();
    }
  }, 15000);
  ifaceTimer.unref();

  return {
    getNetworkInfo: () => getNetworkInfo(port),
    announce: () => broadcastAnnouncement(),
    close: async () => {
      if (closed) return;
      closed = true;
      if (ifaceTimer) clearInterval(ifaceTimer);
      broadcastGoodbye();
      if (companionProcess) {
        try {
          companionProcess.kill("SIGTERM");
        } catch {}
        companionProcess = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {}
        socket = null;
      }
    },
  };
}

module.exports = {
  createMdnsAdvertiser,
  getNetworkInfo,
  getLocalHostName,
  getLanInterfaces,
  encodeName,
  parseName,
  parseQuestions,
  buildARecord,
  buildPtrRecord,
  buildSrvRecord,
  buildTxtRecord,
  buildResponsePacket,
  RECORD_TYPES,
};
