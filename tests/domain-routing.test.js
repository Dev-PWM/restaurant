"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { io } = require("socket.io-client");
const { createService, clientAddress } = require("../server");
const {
  createDomainRouting,
  hostnameOf,
  isLocalSameOrigin,
} = require("../shared/domain-routing.js");

const CUSTOMER = "loshuarachesdezapata.live";
const STAFF = "zapatapos.live";
const PASSWORD = "tunnel-test-only-password";

/** Runs the middleware against a fake request and reports what it did. */
function route(host, url, headers = {}) {
  const routing = createDomainRouting({
    customerDomain: CUSTOMER,
    staffDomain: STAFF,
  });
  const result = { passed: false };
  const [pathname] = url.split("?");
  routing.middleware(
    { headers: host === undefined ? {} : { host, ...headers }, path: pathname, originalUrl: url },
    {
      redirect: (status, location) => Object.assign(result, { status, location }),
      status(status) {
        result.status = status;
        return this;
      },
      type() {
        return this;
      },
      send: (body) => Object.assign(result, { body }),
    },
    () => {
      result.passed = true;
    },
  );
  return result;
}

test("hostnames are compared as plain lower-case DNS names, never by substring", () => {
  assert.equal(hostnameOf("ZapataPOS.live:443"), "zapatapos.live");
  assert.equal(hostnameOf("zapatapos.live."), "zapatapos.live");
  for (const bad of [
    "",
    undefined,
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
    "https://zapatapos.live",
    "zapatapos.live/pos",
    "zapatapos .live",
    "a".repeat(300) + ".live",
  ])
    assert.equal(hostnameOf(bad), "", String(bad));
  assert.notEqual(hostnameOf(`${STAFF}.evil.example`), STAFF);
});

test("domain settings must be bare, distinct host names", () => {
  assert.equal(createDomainRouting().enabled, false);
  assert.throws(
    () => createDomainRouting({ customerDomain: "https://loshuarachesdezapata.live" }),
    /MASAFLOW_CUSTOMER_DOMAIN/,
  );
  assert.throws(
    () => createDomainRouting({ staffDomain: "zapatapos.live/pos" }),
    /MASAFLOW_STAFF_DOMAIN/,
  );
  assert.throws(
    () => createDomainRouting({ customerDomain: STAFF, staffDomain: STAFF }),
    /distintos/,
  );
  const routing = createDomainRouting({ customerDomain: CUSTOMER, staffDomain: STAFF });
  assert.deepEqual(routing.origins, [`https://${CUSTOMER}`, `https://${STAFF}`]);
});

test("the customer domain opens the order app and the staff domain opens the POS", () => {
  assert.deepEqual(route(CUSTOMER, "/"), { passed: false, status: 302, location: "/order/" });
  assert.deepEqual(route(`${STAFF}:443`, "/"), { passed: false, status: 302, location: "/pos/" });
  assert.deepEqual(route(CUSTOMER.toUpperCase(), "/?table=4"), {
    passed: false,
    status: 302,
    location: "/order/?table=4",
  });
});

test("plain-HTTP visits through Cloudflare are sent to HTTPS, because live sync is refused over http", () => {
  assert.deepEqual(route(CUSTOMER, "/order/?table=4", { "x-forwarded-proto": "http" }), {
    passed: false,
    status: 308,
    location: `https://${CUSTOMER}/order/?table=4`,
  });
  assert.equal(route(STAFF, "/", { "x-forwarded-proto": "HTTP, https" }).status, 308);
  assert.equal(route(STAFF, "/", { "x-forwarded-proto": "https" }).location, "/pos/");
  // The local network and unknown hosts carry no such header or are not ours to redirect.
  assert.equal(route(STAFF, "/pos/").passed, true);
  assert.equal(route("localhost:3000", "/", { "x-forwarded-proto": "http" }).passed, true);
});

test("the customer domain never serves the staff apps, however the path is written", () => {
  for (const hidden of [
    "/pos",
    "/pos/",
    "/POS/",
    "/%70os/",
    "//pos/",
    "/pos/realtime.html",
    "/analytics/",
    "/Analytics",
    "/insights",
  ]) {
    const result = route(CUSTOMER, hidden);
    assert.equal(result.status, 404, hidden);
    assert.equal(result.passed, false, hidden);
  }
  for (const allowed of ["/order/", "/order/realtime.html", "/assets/logo.png", "/api/health", "/positions", "/track"])
    assert.equal(route(CUSTOMER, allowed).passed, true, allowed);
  assert.equal(route(CUSTOMER, "/%E0%A4%A").status, 400);
});

test("the staff domain keeps every app, and unknown hosts are left to the default routes", () => {
  for (const url of ["/pos/", "/analytics/", "/order/", "/assets/logo.png"])
    assert.equal(route(STAFF, url).passed, true, url);
  for (const host of [
    undefined,
    "localhost:3000",
    "192.168.1.20:3000",
    `${CUSTOMER}.evil.example`,
    `evil-${STAFF}`,
  ])
    assert.deepEqual(route(host, "/"), { passed: true }, String(host));
});

test("www redirects to the bare domain over HTTPS and keeps the path", () => {
  assert.deepEqual(route(`www.${CUSTOMER}`, "/order/?table=4"), {
    passed: false,
    status: 302,
    location: `https://${CUSTOMER}/order/?table=4`,
  });
  assert.equal(route(`www.${STAFF}`, "//evil.example").location, `https://${STAFF}//evil.example`);
});

test("local-network access is limited to the same private site the browser asked for", () => {
  for (const [origin, host] of [
    ["http://localhost:3000", "localhost:3000"],
    ["http://127.0.0.1:3000", "127.0.0.1:3000"],
    ["http://192.168.1.20:3000", "192.168.1.20:3000"],
    ["http://10.0.0.5:3000", "10.0.0.5:3000"],
    ["http://172.16.4.2:3000", "172.16.4.2:3000"],
    ["http://masaflow.local:3000", "masaflow.local:3000"],
    ["http://staff.localhost:3111", "staff.localhost:3111"],
    ["http://[::1]:3000", "[::1]:3000"],
  ])
    assert.equal(isLocalSameOrigin(origin, host), true, origin);
  for (const [origin, host] of [
    ["http://192.168.1.20:3000", "localhost:3000"],
    ["http://evil.example", "evil.example"],
    ["http://172.32.0.1:3000", "172.32.0.1:3000"],
    ["http://8.8.8.8", "8.8.8.8"],
    ["https://192.168.1.20:3000", "192.168.1.20:3000"],
    [`https://${STAFF}`, STAFF],
    ["null", "localhost:3000"],
    [undefined, "localhost:3000"],
    ["http://localhost:3000", undefined],
  ])
    assert.equal(isLocalSameOrigin(origin, host), false, String(origin));
});

test("forwarded addresses are honoured only from the proxy that is allowed to set them", () => {
  assert.equal(clientAddress("127.0.0.1", "203.0.113.9"), "203.0.113.9");
  assert.equal(clientAddress("192.168.1.50", "127.0.0.1"), "192.168.1.50");
  assert.equal(clientAddress("192.168.1.50", "127.0.0.1", true), "127.0.0.1");
});

async function tunnelFixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-domains-"));
  const sockets = [];
  const service = await createService({
    dataDirectory: directory,
    staffPassword: PASSWORD,
    customerDomain: CUSTOMER,
    staffDomain: STAFF,
    ...options,
  });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await service.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  const port = service.server.address().port;
  const url = `http://127.0.0.1:${port}`;
  const get = (pathname, headers = {}) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        { host: "127.0.0.1", port, path: pathname, headers },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () =>
            resolve({ status: response.statusCode, location: response.headers.location, body }),
          );
        },
      );
      request.on("error", reject);
      request.end();
    });
  /** Opens a socket the way a browser on `origin` would and reports whether the server let it in. */
  const attempt = (origin, { namespace = "", headers = {}, transports } = {}) =>
    new Promise((resolve) => {
      const socket = io(url + namespace, {
        autoConnect: false,
        reconnection: false,
        transports,
        auth: { sessionId: randomUUID(), token: "" },
        extraHeaders: { Origin: origin, ...headers },
      });
      sockets.push(socket);
      socket.once("connect", () => resolve({ connected: true, message: "" }));
      socket.once("connect_error", (error) =>
        resolve({ connected: false, message: error.message }),
      );
      socket.connect();
    });
  const accepts = async (origin) => (await attempt(origin)).connected;
  return { service, url, get, accepts, attempt };
}

test("real server: each domain lands on its app and the customer domain hides the staff apps", async (t) => {
  const { get } = await tunnelFixture(t);
  assert.deepEqual(
    (({ status, location }) => ({ status, location }))(await get("/", { Host: CUSTOMER })),
    { status: 302, location: "/order/" },
  );
  assert.deepEqual(
    (({ status, location }) => ({ status, location }))(await get("/", { Host: STAFF })),
    { status: 302, location: "/pos/" },
  );
  assert.equal((await get("/pos/", { Host: CUSTOMER })).status, 404);
  assert.equal((await get("/analytics/", { Host: CUSTOMER })).status, 404);
  assert.notEqual((await get("/pos/", { Host: STAFF })).status, 404);
  assert.notEqual((await get("/analytics/", { Host: STAFF })).status, 404);
  assert.equal((await get("/api/health", { Host: CUSTOMER })).status, 200);
  assert.equal((await get("/api/network", { Host: STAFF })).status, 404);
  assert.equal((await get("/api/network/qr", { Host: STAFF })).status, 404);
});

test("real server: both domains and the local network can sync, any other origin cannot", async (t) => {
  const { accepts, url } = await tunnelFixture(t);
  assert.equal(await accepts(`https://${CUSTOMER}`), true);
  assert.equal(await accepts(`https://${STAFF}`), true);
  assert.equal(await accepts(url), true);
  assert.equal(await accepts("https://other.example.com"), false);
  assert.equal(await accepts(`https://www.${CUSTOMER}`), false);
  assert.equal(await accepts(`http://${CUSTOMER}`), false);
  assert.equal(await accepts("http://192.168.1.20:3000"), false);
});

test("real server: the single-origin Caddy mode keeps rejecting local origins", async (t) => {
  const { accepts, url } = await tunnelFixture(t, {
    customerDomain: "",
    staffDomain: "",
    publicOrigin: `https://${STAFF}`,
  });
  assert.equal(await accepts(`https://${STAFF}`), true);
  assert.equal(await accepts(url), false);
  assert.equal(await accepts(`https://${CUSTOMER}`), false);
});

test("real server: public domains need the long staff password", async () => {
  await assert.rejects(
    createService({
      dataDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-domains-")),
      pin: "1234",
      customerDomain: CUSTOMER,
      staffDomain: STAFF,
    }),
    /MASAFLOW_STAFF_PASSWORD/,
  );
});

test("real server: the Admin UI is refused for anything that arrived through a public domain or Cloudflare", async (t) => {
  const { get, attempt, url } = await tunnelFixture(t, {
    adminPasswordHash: bcrypt.hashSync("local-only-password", 4),
  });
  assert.equal((await get("/admin-ui/", { Host: STAFF })).status, 403);
  assert.equal((await get("/admin-ui/", { Host: CUSTOMER })).status, 403);
  assert.equal(
    (await get("/admin-ui/", { Host: new URL(url).host, "Cf-Connecting-Ip": "203.0.113.9" })).status,
    403,
  );
  assert.equal(
    (await get("/admin-ui/", { Host: new URL(url).host, "X-Forwarded-For": "203.0.113.9" })).status,
    403,
  );
  assert.equal((await get("/admin-ui/")).status, 200);
  const refused = "Solo disponible desde este equipo.";
  // Over the tunnel the Host is the public domain: refused before any password is checked.
  assert.equal(
    (await attempt(`https://${STAFF}`, { namespace: "/admin", headers: { Host: STAFF }, transports: ["websocket"] })).message,
    refused,
  );
  // Control: from this computer the same namespace gets past that check and only fails on credentials.
  const local = await attempt(url, { namespace: "/admin", transports: ["websocket"] });
  assert.equal(local.connected, false);
  assert.notEqual(local.message, refused);
});
