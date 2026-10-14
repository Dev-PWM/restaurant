"use strict";
const fs = require("node:fs");
const { createService } = require("../../server");
let stage = "";
function die() {
  process.kill(process.pid, "SIGKILL");
}
(async () => {
  const directory = process.argv[2],
    open = fs.promises.open,
    rename = fs.promises.rename;
  // Exercise the production asynchronous writer, at deterministic I/O boundaries.
  fs.promises.open = async function (...args) {
    const handle = await open.apply(fs.promises, args),
      write = handle.writeFile.bind(handle),
      sync = handle.sync.bind(handle);
    handle.writeFile = async (...values) => {
      const result = await write(...values);
      if (stage === "after_write") die();
      return result;
    };
    handle.sync = async () => {
      const result = await sync();
      if (stage === "after_commit" && args[0] === directory) die();
      return result;
    };
    return handle;
  };
  fs.promises.rename = async function (...args) {
    const result = await rename.apply(fs.promises, args);
    if (stage === "after_rename") die();
    return result;
  };
  const service = await createService({
    dataDirectory: directory,
    pin: "9276",
  });
  await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
  process.on("message", (message) => {
    if (message.type === "arm") {
      stage = message.stage;
      process.send({ type: "armed" });
    }
  });
  process.send({ type: "ready", port: service.server.address().port });
})().catch((error) => {
  process.send?.({ type: "error", message: error.message });
  process.exitCode = 1;
});
