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
- `sudo` asks for the password of `ubuntu`.

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
  this adds those of Caddy and Node.js (the websites use the new Node.js when their service
  restarts). Each new repository goes there too, e.g. Docker's.

```bash
sudo install -m 0644 /tmp/server-etc/apt/apt.conf.d/5* /etc/apt/apt.conf.d/
apt-config dump | grep -i 'Automatic-Reboot'
# Automatic-Reboot "true", Automatic-Reboot-Time "04:00"
sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i 'allowed origins'
# … site=dl.cloudsmith.io, site=deb.nodesource.com
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

## 5. Check from the Internet

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

## Not done, on purpose

- fail2ban: it slows down password guessing; with keys only, there is nothing to guess.
- Another SSH port: a scan of every port finds it anyway, and every tool must be told.
- `AllowUsers` in the SSH configuration: an account added later could not log in, with no
  clear error.
- Ubuntu 26.04: 24.04 gets security updates until 2029. Changing the release of a server
  that runs websites is a project of its own.
- Ubuntu Pro, free for personal use: security updates of the `universe` packages (ESM Apps)
  and kernel fixes without reboot (Livepatch). Possible later.

## Also on this server

- The other website runs as its own user, `mini-jeux`: a systemd user service,
  `mini-jeux.service`, started at boot because the user "lingers" (`loginctl enable-linger`).
  It listens on `127.0.0.1:3000`.
- Caddy, installed from its own apt repository, serves both websites. Its admin API listens
  on `127.0.0.1:2019`: any program of the server can change Caddy's configuration through
  it. To restrict at step 4.2, with the configuration of statslol.
- No swap yet: to add at step 4.2, with PostgreSQL.
