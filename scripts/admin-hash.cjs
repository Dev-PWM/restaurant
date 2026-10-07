#!/usr/bin/env node
"use strict";
/**
 * Prints a bcrypt hash for MASAFLOW_ADMIN_PASSWORD_HASH (the Socket.io Admin UI login).
 * The password is read without echo, or from stdin when piped, so it never lands in shell history:
 *   npm run admin:hash
 */
const bcrypt = require("bcryptjs");

function readSecret(prompt) {
  if (!process.stdin.isTTY)
    return new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
    });
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function onData(chunk) {
      for (const key of chunk) {
        if (key === "\u0003") process.exit(130);
        if (key === "\r" || key === "\n" || key === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        value = key === "\u007f" ? value.slice(0, -1) : value + key;
      }
    });
  });
}

readSecret(
  "Contraseña del panel de administración (mín. 12 caracteres): ",
).then((password) => {
  if (password.length < 12) {
    console.error("Usa al menos 12 caracteres.");
    process.exit(1);
  }
  console.log(
    "\nAgrega esta línea a tu .env tal cual (las comillas simples protegen los $):\n",
  );
  console.log(
    `MASAFLOW_ADMIN_PASSWORD_HASH='${bcrypt.hashSync(password, 10)}'`,
  );
});
