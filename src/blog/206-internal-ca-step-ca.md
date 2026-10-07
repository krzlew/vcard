---
layout: layouts/post.njk
pageNumber: P206
extensionText: "206: INTERNAL CA WITH STEP-CA"
title: "Running a tiny internal CA: one trust root, two ways to issue certs"
number: 206
date: 2026-10-07
tags: [PKI, STEP-CA, ACME, TRAEFIK]
summary: A small step-ca internal CA with manual and ACME issuance, and why automation turns certificate lifetime from an operational constraint into a security choice
permalink: /blog/internal-ca-step-ca/
---
## PROBLEM

A browser complains about `https://something.internal`, someone creates a self-signed certificate, the next service gets a different one, and a third stays on plain HTTP because "it's only internal". Internal networks collect these TLS exceptions over time.

At work I wanted something cleaner: one internal Certificate Authority, one trust root, and certificates that behave like normal certificates. The result is a small [step-ca](https://smallstep.com/docs/step-ca/) deployment serving internal `.tld` services (`ca.tld`, `nas.tld`, `ldap.tld`, `sonar.tld`, `nexus.tld`, `n8n.tld`) with two very different issuance workflows.

## TRUST THE ROOT

An internal CA means distributing one trust root instead of trusting twenty separate self-signed certificates. The root is served by the CA itself:

```text
https://ca.tld:9000/roots.pem
```

On Ubuntu it goes into the system store:

```bash
sudo cp roots.pem /usr/local/share/ca-certificates/Internal_Root_CA.crt
sudo update-ca-certificates
```

Chrome may use an NSS database instead of the system store, so import it there too:

```bash
sudo apt install libnss3-tools
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Internal Root CA" -i roots.pem
```

And on Windows, into the machine store:

```powershell
Import-Certificate -FilePath "path\to\roots.pem" -CertStoreLocation cert:\LocalMachine\Root
```

Issuing certificates is the easy part. Making every laptop, browser, CLI tool, runtime and container trust your CA consistently is where the real work lives.

## BOOTSTRAP A HOST

Before a host can request certificates, the `step` CLI has to know which CA to trust:

```bash
sudo apt install step-cli
step ca bootstrap --ca-url https://ca.tld:9000 --fingerprint <root-ca-fingerprint> --install
```

The first connection is the moment where blindly trusting whatever answers on the network would defeat the point, so I read the fingerprint directly on the CA host:

```bash
docker exec step-ca step certificate fingerprint /home/step/certs/root_ca.crt
```

## VERSION ONE: MANUAL CERTIFICATES

The original model was intentionally simple. Certificates are requested **on the destination machine**:

```bash
step ca certificate nexus.tld nexus.crt nexus.key \
  --provisioner admin \
  --provisioner-password-file <file> \
  --console
```

Running it on the target means the private key is generated there and never travels through Ansible, SCP, the CA host or somebody's laptop. The same pattern covers `ldap.tld`, `nas.tld` and `sonar.tld`.

It works, with a catch: because renewal is manual, certificates get long. One of ours was issued for roughly three years. The harder renewal is, the longer you are tempted to make certificates live.

It also leaves one manual step in otherwise automated deployments: Ansible configures the app, proxy, firewall and DNS, and then a human issues the certificate. Two paper cuts along the way:

- `step ca certificate` wants a real TTY for its progress UI, so `ssh -tt host` works much better than plain `ssh host command`
- `--provisioner-password-file` expects an actual file - building it through layers of shell quoting more than once produced a valid but empty one

## ADDING ACME

I didn't start with ACME because the CA itself was being migrated at the time, and changing several infrastructure assumptions at once makes debugging miserable. Once the migration was stable, I added a second provisioner next to the existing JWK one instead of replacing it:

```text
step-ca
  admin   JWK
  acme    ACME
```

The Ansible task is idempotent - it checks `ca.json` for an existing ACME provisioner first, then adds one with deliberately short lifetimes:

```yaml
- name: Add the ACME provisioner
  ansible.builtin.command:
    argv:
      - step
      - ca
      - provisioner
      - add
      - acme
      - --type=ACME
      - --ca-config={{ stepca_config }}
      - --challenge=http-01
      - --x509-min-dur=5m
      - --x509-default-dur=24h
      - --x509-max-dur=168h
```

Traefik already terminates TLS for the apps behind it, so it became the ACME client. Its certificate resolver points at the internal CA (and trusts the root while talking to it):

```text
https://ca.tld:9000/acme/acme/directory
```

Enabling TLS for a service takes two labels:

```yaml
labels:
  - traefik.http.routers.myapp.tls=true
  - traefik.http.routers.myapp.tls.certresolver=stepca
```

A new app is now: create the DNS record, deploy the container, add the labels, and the certificate appears. No certificate files pass through deployment automation and no private key lands in a repository.

"Traefik accepted the config" wasn't enough proof for me. I deployed a throwaway `whoami` container with a temporary DNS record and checked the issuer, the chain, the hostname, browser trust and the roughly 24 hour lifetime, then deleted it. "This should work" is documentation; "this produced an actual certificate" is a test.

One networking detail: Traefik and `step-ca` run as separate Docker Compose projects on separate networks, so the HTTP-01 validation request doesn't hop container to container. It leaves the CA and comes back in through the host.

## THREE YEARS VS 24 HOURS

A three-year certificate makes sense when renewal means a human logs in, authenticates to the CA, generates files, deploys them and restarts something. A 24-hour certificate makes sense when Traefik notices expiry, asks for a new one, step-ca validates the challenge and nobody cares how often that happens.

Automation changes certificate lifetime from an operational constraint into a security choice.

I kept the manual provisioner too. Services like Nexus or n8n that live in dedicated LXCs and terminate TLS themselves work fine with a locally requested certificate, and keeping both models meant nothing had to be converted in one big change.

## WHERE IT HELPS, WHERE IT CREATES WORK

What clearly improved:

- **Internal HTTPS** - `https://nexus.tld` instead of `https://10.0.0.12:8443` and a warning page
- **No more insecure flags** - `-k`, `verify=false` and `NODE_TLS_REJECT_UNAUTHORIZED=0` have a habit of outliving the "temporary testing" that created them
- **ACME** - removes certificate lifecycle work from humans, which makes it the biggest win

What I'd be careful with:

- **Manual long-lived certificates** - without monitoring, a three-year certificate is a calendar event three years away
- **Client and device certificates** - mTLS looks simple in diagrams, but enrollment, renewal, revocation, lost devices and departing people are an identity-management problem the CA doesn't solve for you
- **The CA itself** - the more things trust it, the more it matters. Root and intermediate key protection, backups, recovery and rotation are now yours, and the certificates are the easy bit

## WHAT I DON'T USE YET

step-ca can do a lot more than this setup uses, and the [Smallstep tutorials](https://smallstep.com/docs/tutorials/) are the place to look when the need shows up. These are things I don't need at the moment, not a roadmap:

- **Kubernetes** - [cert-manager with step-ca](https://smallstep.com/docs/tutorials/kubernetes-acme-ca/) for workload certificates, which would matter if the workloads moved to a cluster
- **Keycloak** - the [OIDC provisioner](https://smallstep.com/docs/tutorials/keycloak-oidc-provisioner/) so people get certificates by logging in with SSO instead of a shared provisioner password
- **SSH certificates** - an [SSH CA](https://smallstep.com/docs/tutorials/ssh-certificate-login/) in place of copying keys into `authorized_keys`, though "one CA for everything" shares one failure domain and deserves thought first

## WHERE I LANDED

The CA now has one trust root, automatic ACME certificates for Traefik services and manual certificates for a handful of dedicated hosts. Browser warnings are gone, the self-signed certificates are retired, and short-lived TLS is practical.

When renewal costs human time, certificates live for years. When renewal costs nothing, 24 hours feels reasonable.
