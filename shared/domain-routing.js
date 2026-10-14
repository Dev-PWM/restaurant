// @ts-check
"use strict";
const { isIP } = require("node:net");

/** One Cloudflare Tunnel serves both brands, so the Host header decides which app a visitor sees.
 * Customers get the public brand at the customer domain; staff get the tools at the staff domain. */
const ROLES = {
  customer: { home: "/order/", hidden: ["/pos", "/analytics", "/insights"] },
  staff: { home: "/pos/", hidden: [] },
};

/** Lower-case DNS name from a Host header or a domain setting, or "" when it is not a plain name.
 * Ports and a trailing dot are dropped; IP literals, "localhost" and anything with a path or scheme are rejected.
 * @param {unknown} value */
function hostnameOf(value) {
  if (typeof value !== "string" || value.length > 260) return "";
  const name = value
    .trim()
    .toLowerCase()
    .replace(/:\d{1,5}$/, "")
    .replace(/\.$/, "");
  const labels = name.split(".");
  return name.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    !isIP(name)
    ? name
    : "";
}

/** @param {string} label @param {unknown} value @returns {string} */
function domainSetting(label, value) {
  if (value === undefined || value === "") return "";
  const name = hostnameOf(value);
  if (!name || name !== String(value).trim().toLowerCase())
    throw new Error(
      `${label} debe ser solo el nombre del dominio, sin https://, puerto ni ruta.`,
    );
  return name;
}

/** Path as the static handlers will see it: decoded, lower-cased, repeated slashes collapsed.
 * @param {string} pathname @returns {string | null} null when the encoding is invalid */
function normalizedPath(pathname) {
  try {
    return decodeURIComponent(pathname).toLowerCase().replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}

/** True for an Origin that is the same private-network site the browser asked for (localhost, *.localhost, LAN IP or .local name),
 * so the restaurant keeps working over the local network when the internet is down.
 * A public name never matches, which keeps DNS-rebinding pages out.
 * @param {string | undefined} origin @param {string | undefined} hostHeader */
function isLocalSameOrigin(origin, hostHeader) {
  if (!origin || !hostHeader) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || url.host !== hostHeader.toLowerCase())
    return false;
  const name = url.hostname.replace(/^\[|\]$/g, "");
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local")
  )
    return true;
  if (isIP(name) === 6)
    return name === "::1" || /^f[cd]/.test(name) || /^fe80:/.test(name);
  const [a = 0, b = 0] = name.split(".").map(Number);
  return (
    isIP(name) === 4 &&
    (a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31))
  );
}

/** @param {{customerDomain?: string, staffDomain?: string}} [options] */
function createDomainRouting(options = {}) {
  const customer = domainSetting(
    "MASAFLOW_CUSTOMER_DOMAIN",
    options.customerDomain,
  );
  const staff = domainSetting("MASAFLOW_STAFF_DOMAIN", options.staffDomain);
  if (customer && customer === staff)
    throw new Error(
      "MASAFLOW_CUSTOMER_DOMAIN y MASAFLOW_STAFF_DOMAIN deben ser dominios distintos.",
    );
  /** @type {Map<string, keyof typeof ROLES>} */
  const roles = new Map();
  if (customer) roles.set(customer, "customer");
  if (staff) roles.set(staff, "staff");
  /** @type {import("express").RequestHandler} */
  const middleware = (req, res, next) => {
    const host = hostnameOf(req.headers.host);
    const alias = host.startsWith("www.") ? host.slice(4) : "";
    if (alias && roles.has(alias))
      return res.redirect(302, `https://${alias}${req.originalUrl}`);
    const role = roles.get(host);
    if (!role) return next();
    // Cloudflare also proxies plain HTTP, but live sync is accepted only from the https origins.
    const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0];
    if (proto.trim().toLowerCase() === "http")
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    const path = normalizedPath(req.path);
    if (path === null) return res.status(400).send("Dirección inválida.");
    if (path === "/") {
      const query = req.originalUrl.indexOf("?");
      return res.redirect(
        302,
        ROLES[role].home + (query < 0 ? "" : req.originalUrl.slice(query)),
      );
    }
    if (
      ROLES[role].hidden.some(
        (/** @type {string} */ hidden) =>
          path === hidden || path.startsWith(`${hidden}/`),
      )
    )
      return res.status(404).type("text/plain").send("No encontrado.");
    next();
  };
  return {
    enabled: roles.size > 0,
    hosts: [...roles.keys()],
    origins: [...roles.keys()].map((name) => `https://${name}`),
    /** Whether a request came in under one of the public domains (as opposed to the local network). */
    isPublicHost: (/** @type {unknown} */ hostHeader) =>
      roles.has(hostnameOf(hostHeader)),
    middleware,
  };
}

module.exports = { createDomainRouting, hostnameOf, isLocalSameOrigin };
