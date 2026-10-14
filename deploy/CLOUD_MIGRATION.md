# Optional paid cloud server deployment and migration

Alternative architecture (the selected free-tier deployment is documented in CLOUDFLARE_FREE.md): one DigitalOcean Basic Droplet (Ubuntu 24.04 LTS,
1 vCPU, 2 GiB RAM, 50 GiB disk), daily provider backups, and a separate
Cloudflare Tunnel. Keep both existing domains. Start with the regular $12/month
plan; daily percentage-based backups add $3.60/month, before taxes and other
usage. Confirm prices and available capacity at purchase. No resource has been
provisioned by preparing these files.

The current atomic-file ledger requires one running writer and durable disk.
Use `compose.cloud.yaml`; it keeps data in `masaflow-cloud-data` and does not
publish any application ports. Cloudflare connects to `http://app:4173` on the
private Docker network. The existing Mexico City order hours are packaged into
the image. Staff pages and accepted orders remain available outside those hours.

## Provision and stage (does not move the live domains)

1. Create the Droplet with an SSH key and enable daily backups. Restrict incoming
   SSH to the operator's IP with a provider firewall. No inbound 80/443 is needed;
   allow outbound internet access for the Cloudflare connector.
2. Install Docker Engine and the Compose plugin using Docker's official Ubuntu
   instructions. Enable Docker at boot. Keep the operating system updated.
3. Transfer the reviewed project to `/opt/masaflow` over SSH, excluding `.git`,
   `node_modules`, `.env*`, `.masaflow*`, `.cloud-secrets`, `.cloud-backups`, logs,
   test artifacts and local build output. A Git checkout alone will not include
   the current uncommitted deployment and business-hours changes: transfer those
   files or commit a reviewed release first.
4. Privately copy the relevant settings from the Mac's `.env` to `.env.cloud`
   on the cloud server, using `.env.cloud.example` as the template. Preserve the
   staff password and public bank information. Set permissions to `600`.
5. Create a NEW Cloudflare tunnel named `restaurant-cloud`, without moving the
   production hostnames yet. Put its connector token in
   `/opt/masaflow/.cloud-secrets/tunnel-token`; do not put it in a command argument,
   a repository, or chat. The directory is private to the operator. Compose file
   secrets are mounted as files; ensure the connector user can read the mounted
   token. A root-owned directory with mode `700` and a token file with mode `644`
   allows the container to read it while keeping other host users out.
6. Validate and build, without starting production traffic:

   ```sh
   cd /opt/masaflow
   docker compose --env-file .env.cloud -f compose.cloud.yaml config --quiet
   docker compose --env-file .env.cloud -f compose.cloud.yaml build app
   ```

   Record the cloudflared image digest after pulling it and pin that digest for
   the reviewed production release. The template uses the official `latest`
   image until a digest is verified on the actual host.

## Final data move and cutover (outside restaurant hours)

Use a brief planned maintenance window. Do not run the Mac and cloud server
against independently writable copies of the restaurant data with live traffic.
Do not add the cloud server as a replica of the Mac's existing tunnel: Cloudflare
could route orders to either ledger.

1. Confirm the cloud build, staff configuration and account backups are ready.
2. Stop the local server with `npm run schedule:disable`. Confirm health no longer
   responds. Stop the old Mac tunnel connector or remove its production routes
   before moving the hostnames. Keep its configuration available for rollback.
3. Read the configured `MASAFLOW_DATA_DIR` privately (default `.masaflow-realtime`).
   With all writers stopped, create a private archive of that directory, excluding
   `.writer-lock` and `data.json.*.tmp`. Include `data.json`, `archive_*.json` and
   migration backups. Check the archive is readable and calculate its SHA-256.
   Transfer it with SSH; verify the checksum on the cloud server. Keep a separate
   untouched copy on the Mac. Never upload restaurant data to the Git repository.
4. Create and import the empty cloud volume. These commands use the default source
   path and an archive containing files relative to the data directory:

   ```sh
   # On the Mac, after stopping the server:
   umask 077
   tar --exclude='.writer-lock' --exclude='data.json.*.tmp' \
     -czf /tmp/restaurant-data-migration.tgz -C .masaflow-realtime .
   shasum -a 256 /tmp/restaurant-data-migration.tgz
   # Transfer privately; place the archive in /opt/masaflow on the cloud host.

   # On the cloud host (only for a new, empty volume):
   docker volume create masaflow-cloud-data
   docker run --rm -v masaflow-cloud-data:/data \
     -v /opt/masaflow/restaurant-data-migration.tgz:/migration.tgz:ro \
     alpine:3.22 sh -ec \
     'test ! -e /data/realtime/data.json; mkdir -p /data/realtime; tar -xzf /migration.tgz -C /data/realtime; chown -R 1000:1000 /data'
   docker compose --env-file .env.cloud -f compose.cloud.yaml up -d app
   docker compose --env-file .env.cloud -f compose.cloud.yaml exec -T app \
     node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(x=>console.log(x.status)).catch(()=>process.exit(1))"
   ```

5. The service validates the ledger before reporting ready. Before opening traffic,
   verify the imported shift ID, completed order count and cash/SPEI totals against
   the preserved source. Keep migration artifacts private; remove temporary
   transfer copies after verification, retaining the private backup.
6. Move both Cloudflare hostname routes to the NEW cloud tunnel, with service
   `http://app:4173`. Leave HTTP Host Header unset so the app can distinguish the
   customer and staff domains. Keep Always Use HTTPS enabled on both zones.
7. Start the connector:

   ```sh
   docker compose --env-file .env.cloud -f compose.cloud.yaml up -d tunnel
   ```

8. Verify over cellular data: customer closed page outside hours; staff sign-in;
   existing sales totals; existing order tracking; customer-domain staff paths
   return 404. Reboot the cloud host and repeat the checks. During opening hours,
   verify a controlled order through acceptance, ready status, payment and sales.
   Monitor service health and errors for at least 15 minutes after switching.
9. Keep the Mac's routine disabled. The Mac can now be closed once the actual
   cloud tests pass. Cloud-only operation requires internet at the restaurant.

## Backups and recovery

Daily Droplet backups preserve the whole server, including the Docker volume and
archives. Configure them outside business hours when possible. Also maintain
private ledger exports on a separate machine/account. Before launch, restore a
provider backup into an isolated test server; do not attach production hostnames
to the restored copy. Confirm its ledger loads and that totals match.

Keep export and provider-backup access restricted to the restaurant owner.
Disk use and application log retention must be monitored; provider backups do not
replace checking that the ledger is valid. Never use `docker compose down -v` on
production: it deletes the restaurant volume.

## Rollback

Stop cutover if readiness fails, data totals differ, staff cannot sign in, or the
order/payment workflow fails. Before any cloud orders have been accepted, stop
both cloud services, restore the original Cloudflare routes, and re-enable the
Mac routine. If the cloud has accepted orders or payments, keep it as the source
of truth: stop all writers and migrate its latest ledger back before reopening
the Mac. Restoring the old Mac copy would lose those transactions.

## Verification status

Local app build, 264 tests, business-hours boundaries and desktop/mobile closed
page checks passed before this package was prepared. Docker is not installed on
this Mac; container build, secret mounts, volume import, provider backups, public
routing and reboot recovery still require verification on the actual cloud host.
