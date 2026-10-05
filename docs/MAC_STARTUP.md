# Starting MasaFlow on this Mac

Double-click **[Start MasaFlow.command](../launchers/Start%20MasaFlow.command)** in Finder. The launcher starts the local server, waits until it confirms the correct restaurant data directory, and opens the cashier screen. If this same instance is already ready, it opens that instance. It refuses to reuse another application or a MasaFlow instance with different data on the same port.

Node.js **22.12 or newer** must be installed. The Finder shortcuts look in the current shell's Node path, `~/.local/bin`, Homebrew, and common nvm/fnm locations. To select a different executable explicitly, set `MASAFLOW_NODE`. The login installer resolves the executable to an absolute path; it does not require an interactive shell or a particular Node installation manager. Nothing downloads or installs Node automatically.

## Start after login

Double-click **[Enable Login Startup.command](../launchers/Enable%20Login%20Startup.command)**, or run:

```sh
node scripts/mac-login.cjs install
node scripts/mac-login.cjs status
```

This installs a per-user LaunchAgent in `~/Library/LaunchAgents`, scoped to this restaurant's data directory. It starts when this user logs into macOS, and restarts the server after an unexpected failure. The installer only replaces its own agent. If a server is already running outside the agent, installation stops with a clear message so it can be shut down normally before installation; it never kills an arbitrary process using the port.

The server starts at login without opening a browser window. Double-click the Start shortcut whenever you want to open the cashier screen. The agent does not run before user login. It cannot serve orders while the Mac is asleep, shut down, or logged out. Keep the Mac awake during service.

To disable automatic startup and stop the agent's server, double-click **[Disable Login Startup.command](../launchers/Disable%20Login%20Startup.command)**, or run:

```sh
node scripts/mac-login.cjs uninstall
```

Uninstalling removes only this LaunchAgent. It preserves saved orders, drawer audits, backups, logs, and `.env`. The Start shortcut remains available for manual startup. For restoring data, first disable login startup and stop any manually started server; re-enable the agent when restoration is complete.

## Configuration and logs

Put server settings in the repository's ignored `.env` file. The wrapper reads it as dotenv data, with existing process environment values taking precedence. It never executes shell text from `.env`. The launcher binds to **127.0.0.1** to keep the existing trusted-counter deployment local.

`PORT` defaults to `4173`. `MASAFLOW_DATA_DIR` defaults to `.masaflow` inside this repository and can be an absolute or repository-relative path. The installer freezes these two operational settings in the plist so each restart targets the same data directory and port. Reinstall login startup after deliberately changing either setting. AI Gateway credentials are read by the server from `.env`; credentials are never placed in the plist, shortcut, URL, or browser code.

Logs live in the effective data directory under `logs/startup.log` and `logs/startup-error.log`. The default `.masaflow` directory is ignored by Git. On launch/installation, log files larger than 5 MB are rotated to a single `.previous` copy. Files are created with private permissions. Logs are not deleted by disabling startup.

If Node or the repository moves, run the installer again from the new location. If macOS denies access to Desktop files, check the app's access in System Settings → Privacy & Security → Files and Folders. The error log and `mac-login.cjs status` show whether the agent is loaded and whether its server is ready. A port or data-lock conflict leaves the agent idle, rather than repeatedly trying to bind the same occupied port; resolve the conflict and reinstall the agent.

## Preview and testing

These commands report their plan without starting the server, registering a LaunchAgent, opening a browser, or writing files:

```sh
node scripts/mac-start.cjs --dry-run
node scripts/mac-login.cjs install --dry-run
node scripts/mac-login.cjs uninstall --dry-run
```

`node --test tests/mac-startup.test.js` verifies runtime discovery, literal dotenv handling, data-directory identity, health checks, safe port conflicts, dry-run behavior, private logs, plist validity, scoped installation/removal, and rollback with temporary directories and an injected `launchctl` adapter. It does not touch the operational ledger or install a real LaunchAgent.

LaunchAgent behavior follows Apple's local `launchctl(1)` and `launchd.plist(5)` manuals: `bootstrap`/`bootout` use the logged-in user's `gui/<uid>` domain, `RunAtLoad` starts at loading, and `KeepAlive` with `SuccessfulExit=false` restarts unexpected exits. A 30-second throttle bounds failed startup retries. Expected port and data-lock conflicts exit successfully and remain idle.
