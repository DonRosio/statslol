# The server

statslol runs on an OVH VPS (Ubuntu 24.04 LTS, 2 vCPU, 4 GB of RAM, 40 GB of disk) that it
shares with another website, donrgames.fr. This folder holds the files we added to the
server, at the path they have there (`etc/…` here is `/etc/…` on the server), and how to set
up a server the same way. No address, password or key: the repository does not need them.

Seen from the Internet (step 4.1 of the roadmap):

- only ports 22 (SSH), 80 and 443 (Caddy; TCP, plus UDP 443 for HTTP/3) answer, in IPv4 and
  IPv6; the firewall drops everything else;
- SSH only accepts keys: passwords and `root` are refused;
- updates install themselves (Ubuntu's security updates, Caddy, Node.js), and the server
  reboots at 04:00 UTC when one of them needs it;
- `sudo` asks for the password of `ubuntu`;
- an address whose password statslol refuses 10 times in 10 minutes is blocked (fail2ban).

Inside: 2 GB of swap, and Docker (for statslol), set up so that root in a container is not
root on the server (step 4.2).

## Before changing SSH, the firewall or sudo

A mistake there can lock everyone out of the server. Three habits:

- Keep a session open on the server, and test from a new terminal: reloading SSH does not cut
  the sessions already open.
- Before changing sudo, open a root shell (`sudo -i`) and keep it open: if sudo breaks, only a
  root shell opened before can fix it.
- Check a file before applying it: `sudo sshd -t`, `sudo visudo -cf <file>`.

If you are locked out anyway: in OVH's control panel, the "…" button next to _Boot_ restarts
the VPS in rescue mode, a small system whose credentials come by email. Log in to it with SSH,
mount the server's disk and fix the file. The websites are down until the server restarts
normally. (The KVM console of the control panel would do too, but it does not load, in Chrome
or in Brave.)

Commands marked "computer" run on your computer, from the root of this repository, and reach
the server through its SSH alias (`Host serveur` in `~/.ssh/config`). The others run on the
server, as `ubuntu`. First, copy the files of this folder to the server:

```bash
# computer
scp -r deploy/server/etc serveur:/tmp/server-etc
```

## 1. SSH: keys only

Every account that logs in needs your public key in its `~/.ssh/authorized_keys`: here
`ubuntu`, and `mini-jeux`, the account of the other website. Then:

```bash
sudo install -m 0644 /tmp/server-etc/ssh/sshd_config.d/00-hardening.conf /etc/ssh/sshd_config.d/
sudo sshd -t && sudo sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|maxauthtries|x11forwarding) '
# maxauthtries 3, everything else "no"; then:
sudo systemctl reload ssh
```

Why a file of our own, named `00-`: for most keywords, sshd keeps the first value it reads.
Ubuntu's cloud image ships `50-cloud-init.conf`, which turns passwords on; ours is read
before it, and cloud-init does not touch it.

```bash
# computer, in a new terminal
ssh serveur 'echo key OK'      # key OK
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password serveur
                               # Permission denied (publickey).
ssh root@serveur               # Permission denied (publickey).
```

Before that, robots had tried 43,498 passwords in 5 days, none successfully:

```bash
sudo journalctl -t sshd --since 2026-09-29 --no-pager | grep -c 'Failed password'
sudo journalctl -t sshd --since 2026-09-29 --no-pager | grep -E 'Accepted (password|keyboard-interactive)'
# only our own address
```

## 2. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp comment 'Caddy HTTP/3'
sudo ufw enable
sudo ufw status verbose
```

SSH is allowed before `ufw enable`, so that the session in use survives. UFW filters IPv6 too
(`IPV6=yes` in `/etc/default/ufw`, the default).

Docker bypasses UFW: a port that a container publishes (`ports:` in a compose file) can be
reached from the Internet whatever UFW says, because Docker writes its own firewall rules,
which come first. So the containers of statslol must publish nothing, or only on
`127.0.0.1`: only Caddy faces the Internet.

## 3. Automatic updates

Ubuntu's `unattended-upgrades` installs the security updates of Ubuntu every day
(`/etc/apt/apt.conf.d/20auto-upgrades`, on by default). Two files of ours complete it:

- `51unattended-upgrades-reboot`: an update of the kernel or of the C library only takes
  effect after a reboot. When one needs it (`/var/run/reboot-required`), the server reboots
  by itself at 04:00 UTC: about a minute of downtime.
- `52unattended-upgrades-third-party`: by default, only Ubuntu's repositories are updated;
  this adds those of Caddy, Node.js (the other website uses the new Node.js when its service
  restarts) and Docker. Each new repository goes there too.

```bash
sudo install -m 0644 /tmp/server-etc/apt/apt.conf.d/5* /etc/apt/apt.conf.d/
apt-config dump | grep -i 'Automatic-Reboot'
# Automatic-Reboot "true", Automatic-Reboot-Time "04:00"
sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i 'allowed origins'
# … site=dl.cloudsmith.io, site=deb.nodesource.com, site=download.docker.com
```

## 4. sudo asks for a password

Ubuntu's cloud image lets `ubuntu` use sudo without a password
(`/etc/sudoers.d/90-cloud-init-users`). `99-ubuntu-sudo-password` asks for it: sudo applies
the last rule that matches, and reads the files of `sudoers.d` in alphabetical order (it
skips names with a dot).

First make sure you know the password: `su ubuntu -c 'echo OK'`. Then, in a root shell
(`sudo -i`) kept open until the test passes:

```bash
visudo -cf /tmp/server-etc/sudoers.d/99-ubuntu-sudo-password \
  && install -m 0440 /tmp/server-etc/sudoers.d/99-ubuntu-sudo-password /etc/sudoers.d/ \
  && visudo -c
```

From another terminal, `sudo -k; sudo whoami` asks for the password, then prints `root`. If
it does not, remove `/etc/sudoers.d/99-ubuntu-sudo-password` from the root shell.

## 5. Swap

With PostgreSQL next to the websites, a peak of memory use would make Linux kill a process
(the out-of-memory killer). 2 GB of swap on the disk absorb it, and `vm.swappiness = 10`
(`99-swappiness.conf`) keeps it for when memory runs out.

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab  # once: swap on again after a reboot
sudo install -m 0644 /tmp/server-etc/sysctl.d/99-swappiness.conf /etc/sysctl.d/ && sudo sysctl --system | grep swappiness
free -h  # Swap: 2.0Gi
```

Only root can read the swap file: it can hold pieces of memory, passwords included.

## 6. Docker

Installed from Docker's own repository (`docker.sources`, as in
[Docker's documentation](https://docs.docker.com/engine/install/ubuntu/)), with
`daemon.json` in place before Docker first starts:

- `userns-remap`: root in a container is an unprivileged user of the server (`dockremap`,
  UIDs from 100000). It must be on before the first container: turning it on later hides
  the existing images and volumes.
- `no-new-privileges`: no process of a container can gain privileges (setuid programs).
- `live-restore`: containers keep running while Docker restarts, e.g. for its automatic
  update.
- `log-driver: local`: the logs of each container are rotated (5 files of 20 MB) instead of
  growing until the disk is full.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
gpg --show-keys --with-fingerprint /etc/apt/keyrings/docker.asc
# 9DC8 5822 9FC7 DD38 854A  E2D8 8D81 803C 0EBF CD88, Docker Release (CE deb): stop otherwise
sudo install -d /etc/docker && sudo install -m 0644 /tmp/server-etc/docker/daemon.json /etc/docker/
sudo install -m 0644 /tmp/server-etc/apt/sources.list.d/docker.sources /etc/apt/sources.list.d/
sudo apt update && sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```bash
sudo docker run --rm hello-world  # Hello from Docker!
sudo docker info --format 'security: {{.SecurityOptions}} | logs: {{.LoggingDriver}} | live-restore: {{.LiveRestoreEnabled}}'
# name=userns and name=no-new-privileges among the options, logs: local, live-restore: true
grep dockremap /etc/subuid /etc/subgid  # dockremap:100000:65536 in both
sudo ss -tulpnH | grep -v 127.0.0       # still only sshd and caddy: Docker opened no port
```

Nobody is in the `docker` group: it gives root without a password (whoever can start a
container can mount `/` in it), which would undo section 4. Docker commands go through
`sudo docker`. Remember that ports published by containers bypass UFW (section 2).

## 7. Check from the Internet

```bash
# computer (sudo apt install nmap)
nmap -Pn -p- -T4 <IPv4 address of the server>
nmap -6 -Pn -p- -T4 <IPv6 address of the server>
# 22/tcp, 80/tcp and 443/tcp open; every other port filtered
```

Without IPv6 on your connection, the second scan stops at once with
`filtered tcp ports (net-unreach)`: nothing reached the server. Scan from a network that has
IPv6 (a phone's connection sharing), or list on the server what could answer in IPv6:
`sudo ss -6 -tulpnH` (only sshd and caddy).

## 8. fail2ban: repeated failed passwords on statslol

Done on 2026-10-10 (fail2ban 1.0.2 from Ubuntu's `universe`, covered by Ubuntu Pro's ESM Apps).

statslol asks a name and a password (Caddy's `basic_auth`), and each check costs about a
second of processor. fail2ban reads the access log that Caddy writes for statslol
(`/var/log/caddy/statslol-access.log`, see `statslol.caddy`) and blocks an address refused 10
times in 10 minutes: ports 80 and 443, TCP and UDP (HTTP/3), for an hour, then longer each
time it comes back, up to a week
([etc/fail2ban/jail.d/caddy-statslol-auth.local](etc/fail2ban/jail.d/caddy-statslol-auth.local)).
SSH stays open to it, and fail2ban does not watch SSH (see "Not done, on purpose").

The block is a rule of fail2ban's own nftables table (`inet f2b-table`, checked before UFW's
rules): it also cuts the connections already open, which UFW would let through. The filter
([etc/fail2ban/filter.d/caddy-statslol-auth.conf](etc/fail2ban/filter.d/caddy-statslol-auth.conf))
only reads the fields Caddy writes itself: a request cannot pass for another address.

First, the Caddy files of this repository (statslol.caddy writes the log), as in
[../README.md](../README.md), "Install a change on the running server". Then one request
creates the log (computer):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://statslol.donrgames.fr/   # 401
```

On the server, the log must belong to `caddy`, readable by it only, without passwords:

```bash
sudo ls -l /var/log/caddy/                         # -rw------- caddy caddy … statslol-access.log
sudo tail -n 1 /var/log/caddy/statslol-access.log  # "status":401, "Authorization":["REDACTED"] if any
```

Then fail2ban, our files first, so that its first start already uses them (computer, then
server):

```bash
scp -r deploy/server/etc/fail2ban serveur:/tmp/server-fail2ban
```

```bash
sudo install -D -m 0644 /tmp/server-fail2ban/filter.d/caddy-statslol-auth.conf /etc/fail2ban/filter.d/caddy-statslol-auth.conf
sudo install -D -m 0644 /tmp/server-fail2ban/jail.d/caddy-statslol-auth.local /etc/fail2ban/jail.d/caddy-statslol-auth.local
sudo apt install fail2ban
sudo fail2ban-client -t        # OK: configuration test is successful
sudo fail2ban-client status    # Jail list: caddy-statslol-auth (no sshd)
sudo fail2ban-regex /var/log/caddy/statslol-access.log caddy-statslol-auth
# "Lines: … matched": one per 401 of the log, with your own address
```

A test ban, with an address reserved for documentation (it belongs to nobody):

```bash
sudo fail2ban-client set caddy-statslol-auth banip 192.0.2.10
sudo nft list table inet f2b-table
# tcp dport { 80, 443 } … and udp dport { 80, 443 } … @addr-set-caddy-statslol-auth reject,
# with 192.0.2.10 in the set
sudo fail2ban-client set caddy-statslol-auth unbanip 192.0.2.10
```

fail2ban comes from Ubuntu's `universe` section: Ubuntu commits to security fixes for `main`
only. Ubuntu Pro (free for personal use, below) adds `universe` (ESM Apps), installed by the
automatic updates of section 3.

## Not done, on purpose

- fail2ban for SSH: it slows down password guessing; with keys only, there is nothing to
  guess, and a ban could lock us out. fail2ban only watches statslol's passwords (section 8):
  its `sshd` jail, on by default, is turned off.
- Another SSH port: a scan of every port finds it anyway, and every tool must be told.
- `AllowUsers` in the SSH configuration: an account added later could not log in, with no
  clear error.
- Ubuntu 26.04: 24.04 gets security updates until 2029. Changing the release of a server
  that runs websites is a project of its own.
- Ubuntu Pro, free for personal use: security updates of the `universe` packages (ESM Apps,
  fail2ban among them) and kernel fixes without reboot (Livepatch). Recommended since
  section 8: a token from https://ubuntu.com/pro/dashboard, then `sudo pro attach <token>`.

## Also on this server

- The other website runs as its own user, `mini-jeux`: a systemd user service,
  `mini-jeux.service`, started at boot because the user "lingers" (`loginctl enable-linger`).
  It listens on `127.0.0.1:3000`.
- Caddy, installed from its own apt repository, serves both websites
  ([etc/caddy/Caddyfile](etc/caddy/Caddyfile); statslol's part: [../README.md](../README.md)).
  Its admin API, which can change its whole configuration, listened on `127.0.0.1:2019`,
  open to any program of the server; it is now a Unix socket in Caddy's own folder
  (`/var/lib/caddy/admin.sock`, mode `0200`): only root and Caddy can use it.
- DNS: the zone of donrgames.fr is managed at OVH. `statslol.donrgames.fr` is an A record
  to the server's IPv4 address; like donrgames.fr, it has no AAAA record (the websites are
  reached in IPv4 only).
