# Deploying statslol

statslol runs on the server described in [server/README.md](server/README.md), at
https://statslol.donrgames.fr, for a list of friends.

- `/srv/statslol/` holds `compose.yaml`, `postgres-initdb/` (copies of this folder) and
  `.env` (made from `.env.example`, readable by root only). `compose.yaml` runs the images
  that `.github/workflows/images.yml` publishes to GitHub's container registry for each
  commit of `main`, tagged `sha-<first 7 characters of the commit>`; `STATSLOL_VERSION` in
  `.env` picks the version.
- The Caddy of the server ([server/etc/caddy/](server/etc/caddy/)) serves
  `statslol.donrgames.fr` with HTTPS, asks a name and a password (the friends of
  `/etc/caddy/statslol-friends`) and sends the requests to the containers: `/api/*` to
  the API (port 3100), the rest to the web app (port 3101).
- `statslol-friends` ([server/usr/local/sbin/](server/usr/local/sbin/)) manages the
  friends.
- The security headers every site of the server shares are in
  [server/etc/caddy/security.caddy](server/etc/caddy/security.caddy); see
  [Security headers of the sites](#security-headers-of-the-sites).

Commands marked "computer" run on your computer, from the root of this repository; the
others on the server, as `ubuntu`.

## Every day

```bash
sudo statslol-friends list              # who has access
sudo statslol-friends add <name>        # asks the password twice (16 characters at least)
sudo statslol-friends password <name>
sudo statslol-friends remove <name>     # at once, for the next request of that friend
```

Generate the passwords with a password manager and give each friend theirs privately.
Caddy only keeps a hash of them. The browser keeps the name and password until it is
closed: there is no "log out".

Known limit: Caddy checks a name and password with no limit on attempts. Each attempt with
a name that does not exist costs the server about a second of processor (Caddy then
compares with a slow hash of its own, measured at 1.1 to 1.7 s, which cannot be changed).
A few attempts per second would slow down both websites. Acceptable for a private site
nobody looks for; to fix (blocking addresses after repeated 401s, or a login with its own
limits) before the site is announced anywhere.

```bash
cd /srv/statslol
sudo docker compose ps                             # state of the containers
sudo docker compose logs api --since 1h            # one JSON line per request
sudo journalctl -u caddy --since today             # Caddy: certificates, errors
```

## Backups

Every night at about 03:30 UTC (`statslol-backup.timer`, before the automatic reboots of
04:00), `statslol-backup` dumps the database (`pg_dump`, compressed) into
`/var/backups/statslol/`, readable by root only, checks that the dump can be read, and
deletes the dumps older than 14 days. A failed run leaves no partial file and keeps the
previous dumps.

```bash
sudo systemctl list-timers statslol-backup.timer   # next and last run
sudo journalctl -u statslol-backup --since today    # what the last runs said
sudo statslol-backup                                # one more, now
```

The dumps are on the server itself: they help after a mistake (a bad migration, deleted
rows), not if the server is lost. From time to time, copy the last one to your computer and
check it there; `deploy/check-backup.sh` restores it into a throwaway PostgreSQL container
and shows what it holds (the development database is not touched):

```bash
latest=$(sudo sh -c 'ls -1t /var/backups/statslol/statslol-*.dump | head -n 1')
sudo install -m 0600 -o ubuntu "$latest" /tmp/statslol-latest.dump
```

```bash
# computer
mkdir -p -m 700 ~/statslol-backups
scp serveur:/tmp/statslol-latest.dump ~/statslol-backups/ && ssh serveur rm /tmp/statslol-latest.dump
deploy/check-backup.sh ~/statslol-backups/statslol-latest.dump
```

To restore one on the server, after stopping the API (`sudo docker compose stop api`):
`pg_restore --clean --if-exists --dbname=statslol` inside the postgres container, reading the
dump from its standard input, as `check-backup.sh` does.

## Monitoring

`/api/health` is the only address that needs no password: it only answers
`{"status":"ok"}`. An uptime monitor checks it from the Internet every 5 minutes and sends
an email when statslol stops answering. If `/etc/statslol/backup-ping-url` holds a URL of
Healthchecks.io (readable by root only), each backup that worked calls it, and
Healthchecks.io sends an email when a night goes by without one.

## A new version

When a pull request is merged, the **Images** workflow of `main` publishes the images
(`Published sha-…` in the summary of the run). Then:

```bash
# computer, if deploy/compose.yaml changed
scp deploy/compose.yaml serveur:/tmp/ && ssh -t serveur 'sudo install -m 0644 /tmp/compose.yaml /srv/statslol/'
```

```bash
cd /srv/statslol
sudo sed -i 's/^STATSLOL_VERSION=.*/STATSLOL_VERSION=sha-1a2b3c4/' .env  # the new tag
sudo docker compose pull
sudo docker compose run --rm migrate      # the migrations of the new version, if any
sudo docker compose up --detach --wait    # replaces the containers whose image changed
```

To go back, do the same with the previous tag. The migrations are not undone: only go
back to a version that works with the current tables.

## Security headers of the sites

`/etc/caddy/security.caddy` holds blocks that any site of the server `import`s:

| Block             | For                                                                 | What it does                                                                                                                               |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `hide_server`     | every site                                                          | Caddy no longer says what it is (`Server` header), also on the 401 of a password, a redirection, an error                                  |
| `security_base`   | a site that sends no security headers of its own                    | `hide_server`, HTTPS only for a year, no guessing of file types, a short `Referrer-Policy`, no camera or microphone, only framed by itself |
| `security_strict` | after `security_base`, a site that loads nothing from other origins | never framed, no `Referrer-Policy`, windows and files of other sites kept out                                                              |

The `Content-Security-Policy` is each site's own (it says what the site loads): statslol writes
its own in `statslol.caddy`. A site whose application already sends its security headers
(donrgames.fr does) only takes `hide_server`: the same header twice, or a stricter value
than the application's (a `Permissions-Policy` that forbids the microphone of a game), would
break it.

For another project on this server, add `import security_base` (and `import security_strict`
if it fits) to its site block. For a project on another server, copy `security.caddy` next to its
Caddyfile and add `import /path/to/security.caddy` at the top.

Try a change before installing it (computer, needs Docker; it starts a throwaway Caddy of the
production image): `deploy/check-caddy.sh` validates the whole configuration, and checks the
headers on a page, a password asked, a redirection, a bad gateway and a 404.

### Install a change on the running server

A reload of Caddy interrupts no website, and the configuration is checked before it. Each
command is one block (computer first, then the server).

```bash
scp deploy/server/etc/caddy/Caddyfile deploy/server/etc/caddy/security.caddy deploy/server/etc/caddy/statslol.caddy serveur:/tmp/
```

```bash
ssh -t serveur 'sudo cp -a /etc/caddy /root/caddy-before-security && sudo install -m 0644 /tmp/Caddyfile /tmp/security.caddy /tmp/statslol.caddy /etc/caddy/ && sudo -u caddy env HOME=/var/lib/caddy caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy'
```

Then look at what a stranger gets from each site (computer):

```bash
for url in https://www.donrgames.fr/ https://donrgames.fr/ https://statslol.donrgames.fr/ https://statslol.donrgames.fr/api/health; do echo "== $url"; curl -sI "$url" | grep -iE '^(HTTP|server|via|location|www-authenticate|strict-transport|content-security|permissions-policy|x-frame)'; done
```

There must be no `server` and no `via` line anywhere, and donrgames.fr must still send its own
`content-security-policy` and `permissions-policy: microphone=(self)`. To go back:

```bash
ssh -t serveur 'sudo cp -a /root/caddy-before-security/. /etc/caddy/ && sudo rm /etc/caddy/security.caddy && sudo systemctl reload caddy'
```

What no configuration of Caddy hides: the redirection from HTTP to HTTPS that Caddy writes by
itself still says `Server: Caddy`, and a site seen by a scanner is still known to run on Caddy
by other signs (the way it speaks HTTP/3, its error pages). The header is not a defence, only a
little less said.

## First installation

Done on 2026-10-04 (the backups, section 4, on 2026-10-04 too).

### 1. Access to the images

The images are private. In GitHub's settings, _Developer settings → Personal access
tokens → Tokens (classic)_: a token with the scope `read:packages` only (GitHub's
registry accepts no other kind of token), expiring in a year. Then, on the server, paste
it at the prompt:

```bash
sudo docker login ghcr.io --username DonRosio
```

Docker keeps it in `/root/.docker/config.json`, readable by root only. When it expires,
the server can no longer download new versions: create another one, log in again.

### 2. The files

```bash
# computer: one archive through SSH (-h copies the files postgres-initdb links to)
tar -czh -C deploy compose.yaml .env.example postgres-initdb -C server etc/caddy usr \
  | ssh serveur 'rm -rf /tmp/statslol && mkdir /tmp/statslol && tar -xz -C /tmp/statslol'
```

```bash
sudo install -d /srv/statslol /srv/statslol/postgres-initdb
sudo install -m 0644 /tmp/statslol/compose.yaml /srv/statslol/
sudo install -m 0644 /tmp/statslol/postgres-initdb/* /srv/statslol/postgres-initdb/
# .env, readable by root only: random passwords, the version to run
sudo bash -c 'umask 077 && cd /srv/statslol && while IFS= read -r line; do
  case $line in
    POSTGRES_PASSWORD= | POSTGRES_APP_PASSWORD= | REDIS_PASSWORD=) line+=$(openssl rand -hex 32) ;;
    STATSLOL_VERSION=) line+=sha-ae7d653 ;;
  esac
  printf "%s\n" "$line"
done < /tmp/statslol/.env.example > .env'
sudo nano /srv/statslol/.env               # paste the Riot API key after RIOT_API_KEY=
sudo grep -c '^RIOT_API_KEY=RGAPI-' /srv/statslol/.env   # 1
```

### 3. Start

```bash
cd /srv/statslol
sudo docker compose pull
sudo docker compose run --rm migrate      # creates the tables
sudo docker compose up --detach --wait
curl -s http://127.0.0.1:3100/api/health  # {"status":"ok"}
```

### 4. Backups

```bash
sudo install -m 0755 /tmp/statslol/usr/local/sbin/statslol-backup /usr/local/sbin/
sudo install -m 0644 /tmp/statslol/etc/systemd/system/statslol-backup.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now statslol-backup.timer
sudo systemctl start statslol-backup.service       # a first backup, now
```

### 5. Caddy

The site imports the list of friends: it must exist first. `statslol-friends` checks each
change with `caddy validate` and reloads Caddy, which interrupts no website.

```bash
sudo install -m 0755 /tmp/statslol/usr/local/sbin/statslol-friends /usr/local/sbin/
sudo statslol-friends add <your name>
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-statslol
sudo install -m 0644 /tmp/statslol/etc/caddy/Caddyfile /tmp/statslol/etc/caddy/security.caddy /tmp/statslol/etc/caddy/statslol.caddy /etc/caddy/
sudo -u caddy env HOME=/var/lib/caddy caddy validate --config /etc/caddy/Caddyfile
# Once: the running Caddy still listens on localhost:2019; the new configuration moves its
# admin API to a socket only root and Caddy can use. Afterwards: sudo systemctl reload caddy
sudo -u caddy env HOME=/var/lib/caddy caddy reload --config /etc/caddy/Caddyfile --address localhost:2019
```

Caddy gets the HTTPS certificate of `statslol.donrgames.fr` by itself within seconds
(`sudo journalctl -u caddy | grep -i 'certificate obtained'`). It is then listed in the
public logs of certificates: robots visit, and only meet the password.
