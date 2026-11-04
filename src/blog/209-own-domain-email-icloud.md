---
layout: layouts/post.njk
pageNumber: P209
extensionText: "209: OWN DOMAIN EMAIL"
title: "Own domain email with iCloud+, SPF, DKIM and DMARC"
number: 209
date: 2026-11-04
tags: [EMAIL, ICLOUD, SPF, DKIM, DMARC, DNS]
summary: Cheap email on your own domain with iCloud+ and the DNS records that make it deliverable, using example.tld as the example
permalink: /blog/own-domain-email-icloud/
---
## PROBLEM

If you own a domain and want addresses like `you@example.tld` without running a mail server or paying per mailbox, iCloud+ can host them. The cheapest paid tier (0.99 EUR or USD per month at the time of writing) already includes custom email domains. This post walks through adding the domain, the DNS records Apple asks for, and the three records receivers check before they trust your mail: SPF, DKIM and DMARC. It assumes you can edit DNS records for your domain.

The examples use `example.tld` as a stand-in for my own domain.

## WHAT YOU NEED

- A domain and access to its DNS panel
- An Apple Account with two-factor authentication on
- An iCloud+ subscription, any paid tier
- iCloud Mail turned on for your Apple Account

## WHAT YOU GET AND WHAT YOU DO NOT

Per Apple's limits: up to 5 custom domains per account and up to 10 addresses per domain. You can share a domain with up to 5 other people, and each of them can create 10 addresses on it.

Things to know before you start:
- An address cannot already belong to a different Apple Account, and deleting an Apple Account does not free the address for reuse.
- If you remove the domain, you stop sending and receiving mail on it.
- Managed Apple Accounts (the work and school kind) are not supported.

## 1. ADD THE DOMAIN IN ICLOUD

Open iCloud.com, go to Mail settings and choose the custom domain option. Enter your domain, pick the addresses you want and, if you share the domain, the people to invite. iCloud then shows the DNS records to publish. Apple documents this flow on the [Custom Email Domain support page](https://support.apple.com/en-us/102540), and the exact menu names change between releases, so follow what the screen says.

## 2. THE DNS RECORDS APPLE ASKS FOR

These are the records for `example.tld`. Yours will have your domain and your own verification string.

`MX` records tell the world where to deliver mail for your domain:

```text
example.tld.  MX  10 mx01.mail.icloud.com.
example.tld.  MX  10 mx02.mail.icloud.com.
```

Two servers with the same priority 10 mean senders use either one. If you have old MX records from a previous provider, remove them, otherwise some mail still goes to the old place.

A `TXT` record proves to Apple that you own the domain:

```text
example.tld.  TXT  "apple-domain=xxxxxxxxxxxxxxxx"
```

An `SPF` record lists who may send mail for your domain (details in the next section):

```text
example.tld.  TXT  "v=spf1 include:icloud.com -all"
```

A `DKIM` record lets receivers verify the signature iCloud puts on your outgoing mail. Apple gives it to you as a CNAME, so you only point a name at Apple and Apple manages the key:

```text
sig1._domainkey.example.tld.  CNAME  sig1.dkim.example.tld.at.icloudmailadmin.com.
```

Go back to iCloud and let it verify. DNS changes can take from minutes to a few hours to be visible.

## 3. SPF: WHO MAY SEND AS YOUR DOMAIN

Anyone can type your address into the From line of a message. SPF is a TXT record that lists the servers allowed to send mail for your domain. A receiving server checks the sending server against that list using the envelope sender, the hidden Return-Path address. It does not look at the From line you see in your mail client.

```text
v=spf1 include:icloud.com -all
```

- `v=spf1` marks the record as SPF.
- `include:icloud.com` says "whatever iCloud's own SPF record allows, I allow too".
- `-all` is a hard fail: a message from any other server fails SPF. CERT Polska recommends it for a domain that sends mail. `~all` is a softfail, the common softer choice while you are still finding senders.

Two rules to know:
- A domain may have only one SPF record. Two TXT records starting with `v=spf1` make receivers return `permerror` and treat SPF as failed. If you add another sender later, add another `include:` to the same record.
- SPF evaluation is limited to 10 DNS lookups, counting nested `include:` entries. Every service you add spends some of that budget, so a long chain of includes can break it silently.

## 4. DKIM: A SIGNATURE ON EVERY MESSAGE

SPF only checks the sending server. DKIM adds a cryptographic signature to each outgoing message. The sending server signs with a private key. Receivers fetch the matching public key from DNS and check two things: that the message came from someone who controls the domain, and that the signed parts were not changed on the way. The record lives at `<selector>._domainkey.<domain>`, and for iCloud the selector is `sig1`.

To see that it resolves:

```bash
dig +short CNAME sig1._domainkey.example.tld
dig +short TXT sig1._domainkey.example.tld
```

The first prints Apple's target name, the second prints the public key starting with `v=DKIM1; k=rsa; p=`. If your DNS host is behind a proxy (Cloudflare calls it the orange cloud), set this record to DNS only. The proxy is for web traffic and stops the CNAME from resolving to the key.

Check the saved name too. Some DNS panels append your domain automatically, and pasting the full name gives you `sig1._domainkey.example.tld.example.tld`.

## 5. DMARC: WHAT TO DO WHEN THE CHECKS FAIL

SPF and DKIM each pass or fail on their own, and neither is tied to the address people see in the From line. DMARC ties them together. It requires that SPF or DKIM passes and that the domain it passed for matches the From domain, which is called alignment. It also tells receivers what to do with mail that fails and where to send reports.

It is a TXT record at `_dmarc.<domain>`. This is the end state, so start with `p=none` as described below:

```text
_dmarc.example.tld.  TXT  "v=DMARC1; p=quarantine; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@example.tld"
```

- `p=` is the policy: `none` (only report), `quarantine` (send failures to spam) or `reject` (refuse them).
- `sp=` is the policy for subdomains. Without it they follow `p=`.
- `adkim=s` and `aspf=s` set strict alignment: the domain in the DKIM signature or in the Return-Path must equal the From domain exactly. The default, `r`, is relaxed and also accepts subdomains.
- `rua=` is where aggregate reports go. They are XML files sent daily by big receivers, listing who sent mail as your domain and whether it passed.

The safe order is `p=none`, read reports for a week or two, `p=quarantine`, read reports again, then `p=reject`. Jumping straight to reject locks you out of any sender you forgot about, such as a web form or a newsletter tool.

## 6. TEST IT

Send a message from your new address to a Gmail account, open it, choose Show original and look at the `Authentication-Results` header. You want to see `spf=pass`, `dkim=pass` with `header.d=` set to your own domain, and `dmarc=pass`. A message can show `spf=pass` and `dkim=pass` and still fail DMARC. That happens when neither passing domain matches your From domain, so check which one aligns.

CERT Polska runs a free checker for this at [bezpiecznapoczta.cert.pl](https://bezpiecznapoczta.cert.pl/). In the email test you send a message to an address it gives you, and it reports on SPF, DKIM, DMARC and TLS (encryption in transit). The domain check needs only the domain name and covers SPF, DMARC and TLS, but not DKIM, because DKIM can only be checked on a real message.

From the terminal you can read everything back with `dig`:

```bash
dig +short MX example.tld
dig +short TXT example.tld
dig +short TXT _dmarc.example.tld
```

Authentication does not decide the inbox by itself. A new domain with no history can still land in spam while it builds reputation, so send a few real conversations before judging.

## EXAMPLE.TLD: THE MAIL ZONE

All mail-related records of example.tld in one place:

```text
; delivery
example.tld.  MX  10 mx01.mail.icloud.com.
example.tld.  MX  10 mx02.mail.icloud.com.

; domain ownership for iCloud
example.tld.  TXT  "apple-domain=xxxxxxxxxxxxxxxx"

; SPF
example.tld.  TXT  "v=spf1 include:icloud.com -all"

; DKIM - managed by Apple
sig1._domainkey.example.tld.  CNAME  sig1.dkim.example.tld.at.icloudmailadmin.com.

; DMARC - end state, start with p=none
_dmarc.example.tld.  TXT  "v=DMARC1; p=quarantine; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@example.tld"
```

After publishing the records, run [bezpiecznapoczta.cert.pl](https://bezpiecznapoczta.cert.pl/) again.

## TROUBLESHOOTING

- **iCloud does not verify the domain.** Wait for DNS to propagate, then query the record with `dig` against your authoritative name server to see whether the change is published at all.
- **Mail to you bounces or goes to an old provider.** Old MX records are still there. Only the iCloud pair should remain.
- **Mail from you lands in spam.** Open the headers in a test message and read `Authentication-Results`. Fix whichever of SPF, DKIM or DMARC is not `pass` first.
- **SPF `permerror`.** Two SPF records on one name, or more than 10 lookups. Merge into one record.
- **DKIM does not resolve.** Doubled domain in the name, or a proxy in front of the record.
- **Legitimate mail from a tool is rejected after tightening DMARC.** The tool sends from your domain without being in SPF and without a DKIM signature of your domain. Add it to SPF or set up its DKIM, then retry.
