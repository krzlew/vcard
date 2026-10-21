---
layout: layouts/post.njk
pageNumber: P207
extensionText: "207: BACKUPS THAT SURVIVE"
title: "Backups that survive the rack: failure domains in practice"
number: 207
date: 2026-10-21
tags: [BACKUP, DISASTER RECOVERY, S3, PSQL, GIT]
summary: Write-only off-site copies, encryption you can do but not undo, a pull-based replica for the big data, GitHub metadata exports, and restore recipes - making sure one incident cannot take both production and its backups
permalink: /blog/backups-that-survive-the-rack/
---
## PROBLEM

Most small-company backup setups fail the same way: the backups live in the same blast radius as production. Whoever gets the credentials that run the hypervisor and the NAS can delete every copy, and if the rack burns, the keys, DNS and certificate authority needed to reach the off-site copy burn with it.

This post is for a company that has outgrown "we have snapshots" but is not a corporation yet, the stage where someone starts saying "ISO 27001" in meetings. It covers write-only off-site copies, encryption keys held by people instead of systems, a pull-based replica for the big data, GitHub metadata exports and recovery recipes you can adapt.

The core idea is small. For every copy of your data, ask two questions:

- what can delete it
- what do I need to read it back

If the answer to the first is "the same credentials that run production", or the answer to the second is "something that lives in the same rack", it is not a backup, it is a second copy in the same blast radius.

## THREE SCENARIOS, ONE DESIGN RULE

I design against three failures, each harder than the last:

- **Oops.** Someone deletes a table, a file or a VM. A local snapshot or backup answers this, fast.
- **Owned admin.** An attacker has domain admin, hypervisor admin and NAS admin. Everything reachable with those credentials is gone, including "backups" on the NAS and any cloud bucket those credentials can write to with delete rights.
- **No rack.** Fire, flood, power surge, theft or even [unexploded ordnance](https://www.wroclaw.pl/dla-mieszkanca/bomba-na-kolejowej-ewakuacja-mieszkancow-we-wroclawiu-zdjecia-relacja) forcing an evacuation of the whole neighbourhood. Everything on-premises is gone, including DNS, the internal CA, the identity provider and the password manager you would use to find the off-site credentials.

The first is a convenience. The other two decide whether the company continues. Everything below is about them.

## TWO TIERS, BECAUSE SIZE DECIDES THE TOOL

Daily encrypted full copies in a bucket are a good fit for what is small and critical: databases, configuration, the CA, identity exports, GitHub metadata. They are a bad fit for VM disks and file shares, which are the bulk of what lives in the rack.

Do the cost arithmetic before choosing. Thirty-five days of daily full copies is 35 times the size of one copy, so a 50 GB database costs about 1.75 TB of locked storage, which is fine. The same approach for 4 TB of file data is 140 TB, which is not, and an 18-hour upload per copy (see the transfer arithmetic below) would not finish between two runs.

So I split the problem:

- **Tier 1, small and critical:** encrypted dated archives into a write-only, locked bucket. Covered in the next sections.
- **Tier 2, large data (VM backups, file shares):** an incremental replica that production cannot reach. Covered in "A pull-based replica for big data".

## A COPY THAT CAN ONLY BE ADDED TO

The off-site copy needs a credential that can write and cannot delete. In an S3-compatible bucket that means three parts: Object Lock so versions cannot be removed before a retention date, a policy for the writer without delete permissions, and a separate cloud account so your production admins cannot touch the bucket's configuration at all. The examples use AWS, and Backblaze B2 offers the same building blocks (see the note after the policy).

Create the bucket with Object Lock on (it has to be enabled at creation, and it turns on versioning) and a default retention:

```bash
aws s3api create-bucket --bucket acme-offsite-backups \
  --object-lock-enabled-for-bucket \
  --create-bucket-configuration LocationConstraint=eu-central-1

aws s3api put-object-lock-configuration --bucket acme-offsite-backups \
  --object-lock-configuration \
  '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":35}}}'
```

Which mode you need depends on who you are defending against. Governance mode can only be bypassed by a principal with `s3:BypassGovernanceRetention`, so it already stops anyone who merely holds the writer credential or a production admin login. Compliance mode also stops the owner of the backup account itself, because nobody, including the root user, can shorten or remove the lock before it expires. That matters if you worry about that account being phished or taken over. The price is that you pay for storage you cannot delete, so keep the retention as short as your recovery needs allow.

The writer gets only what it needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::acme-offsite-backups",
        "arn:aws:s3:::acme-offsite-backups/*"
      ]
    }
  ]
}
```

No `s3:DeleteObject`, no `s3:DeleteObjectVersion`, no `s3:PutBucketObjectLockConfiguration`, no `s3:PutLifecycleConfiguration`. Overwriting a key on a versioned bucket just creates a new version, the old one stays. The restore credential is a second, separate identity that exists only in your day-zero kit:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectRetention",
        "s3:ListBucket", "s3:ListBucketVersions"
      ],
      "Resource": [
        "arn:aws:s3:::acme-offsite-backups",
        "arn:aws:s3:::acme-offsite-backups/*"
      ]
    }
  ]
}
```

On Backblaze B2 the same design uses its S3-compatible API and its own Object Lock support, with compliance or governance retention. Instead of an IAM policy you create an application key restricted to that bucket with `writeFiles` and `listFiles` and without `deleteFiles` (see [the capabilities reference](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities)), and point the `aws` CLI at it with `--endpoint-url`. One B2 detail: deleting by name over the S3 API needs `writeFiles`, so that key can still hide the latest version behind a delete marker. Object Lock keeps the data itself intact, but test what your restore tooling shows you.

Expiry is the bucket owner's job, from the backup account with its own credentials, not the writer's. On a versioned bucket you need to expire current and noncurrent versions, with the delay longer than the lock, because a locked version is skipped until its lock ends:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket acme-offsite-backups \
  --lifecycle-configuration '{"Rules":[{
    "ID":"expire","Status":"Enabled","Filter":{"Prefix":""},
    "Expiration":{"Days":40},
    "NoncurrentVersionExpiration":{"NoncurrentDays":1},
    "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":2}}]}'
```

A word about what this does not give you: integrity. Write-only protects against deletion, not against someone with the writer credential uploading garbage. The public key is on production, so the garbage can be perfectly valid age ciphertext, and with a 35-day compliance lock it also stays there and costs money. Nothing cryptographic fixes this, because whatever signs a manifest on production is also in the attacker's hands. What helps is depth and verification: keep enough generations that a few poisoned days do not hide the last good one, restore from the newest copy that passes a real restore test, alert on size anomalies, and cap what the writer can store with a billing alarm on the backup account. The account is also a single point of failure on its own, so give it two owners and a payment method that does not expire quietly.

## ENCRYPT TO A KEY THE SERVER DOES NOT HAVE

If the machine producing backups holds the decryption key, then whoever owns the machine can read every backup. Public-key encryption fixes that: production only holds the public half, so it can encrypt but not decrypt.

```bash
age-keygen -o recovery.key   # run once, on an offline machine
# the file has a "# public key: age1..." line; only that goes to production
```

You can encrypt to more than one recipient, and for the one key that matters most you should: a second, independent key held by someone else means losing one escrow is not the end.

```bash
set -euo pipefail
OUT="appdb-$(date -u +%Y%m%dT%H%MZ).dump.age"

pg_dump -Fc --no-owner appdb \
  | age -r "$AGE_RECIPIENT_1" -r "$AGE_RECIPIENT_2" > "$OUT"

test -s "$OUT"
aws s3 cp "$OUT" s3://acme-offsite-backups/db/appdb/ --only-show-errors
```

`pipefail` is what makes this safe. Without it, a dying `pg_dump` leaves `age` to write a valid but truncated file and the job exits 0, which is a green backup that cannot be restored. Naming the file with a sortable UTC timestamp also pays off later, when "latest" means "last in alphabetical order".

For databases where losing a day is too much, a nightly dump is not enough. Continuous WAL archiving plus a periodic base backup (`pg_basebackup`, encrypted and shipped like the dumps) gives you point-in-time recovery. The archive command runs as the `postgres` user, so it needs the writer credential and nothing else:

```text
archive_command = '/usr/local/bin/archive-wal %p %f'
```

```bash
#!/usr/bin/env bash
# archive-wal: encrypt one WAL segment and upload it; any failure exits non-zero
set -euo pipefail
age -r "$AGE_RECIPIENT_1" -r "$AGE_RECIPIENT_2" < "$1" \
  | aws s3 cp - "s3://acme-offsite-backups/wal/appdb/$2.age" --only-show-errors
```

A dump is a logical, portable copy that survives version upgrades. WAL is for recovering to a specific minute. They answer different questions, so keep both for the databases that matter.

## A PULL-BASED REPLICA FOR BIG DATA

For tier 2, the trick is to reverse who initiates. If production pushes to the backup target, production holds credentials for it. If the backup host pulls from production, production holds nothing, and a compromised production cannot reach the replica.

With ZFS on both ends this is a few commands. On production, a dedicated user may read but not destroy:

```bash
zfs allow -u backupreader send,snapshot,hold tank/data
```

On the replica, which lives elsewhere and is reachable by SSH only outbound from it, an incremental pull of the snapshots:

```bash
ssh backupreader@prod zfs send -i tank/data@2026-10-20 tank/data@2026-10-21 \
  | zfs receive -u backup/data
```

The replica keeps its own snapshot schedule and its own retention. Snapshot holds stop anyone, including you on a bad day, from destroying a snapshot you have decided to keep. If you do not run ZFS, the same shape works with any backup tool that has a server-side append-only mode, with the pruning done from a separate admin identity that is not on production.

A pull-based replica is still the same trade-off as everything else here: it is excellent against deletion and ransomware, and it needs its own restore test, since a replica you have never booted from is just another green job.

## GITHUB IS NOT A BACKUP OF GITHUB

A `git clone --mirror` captures commits. It does not capture issues, pull request discussions, review comments, releases, wikis, branch protection rules, team permissions or Actions configuration. And a single mirror that you refresh in place (`git remote update --prune`) will replace the good state with a force-pushed or truncated one on the next run.

So keep dated bundles instead of one mirror that gets overwritten. This script backs up what the API will give you, and does not stop at the first odd repository:

```bash
#!/usr/bin/env bash
set -uo pipefail
ORG=acme
OUT=/var/backups/github/$(date -u +%Y%m%d)
mkdir -p "$OUT"

gh repo list "$ORG" --limit 1000 --json name,defaultBranchRef \
  -q '.[] | [.name, (.defaultBranchRef.name // "")] | @tsv' |
while IFS=$'\t' read -r repo branch; do
  git clone --mirror --quiet "https://github.com/$ORG/$repo.git" "$OUT/$repo.git" \
    || { echo "clone failed: $repo" >&2; continue; }
  git -C "$OUT/$repo.git" bundle create "$OUT/$repo.bundle" --all \
    || echo "empty or failed bundle: $repo" >&2
  rm -rf "$OUT/$repo.git"

  git clone --mirror --quiet "https://github.com/$ORG/$repo.wiki.git" \
    "$OUT/$repo.wiki.git" 2>/dev/null   # wikis are separate git repos

  for kind in issues pulls issues/comments pulls/comments; do
    gh api --paginate "repos/$ORG/$repo/$kind?state=all&per_page=100" \
      > "$OUT/$repo.${kind//\//-}.json"
  done
  gh api --paginate "repos/$ORG/$repo/rulesets" > "$OUT/$repo.rulesets.json"
  [ -n "$branch" ] && gh api "repos/$ORG/$repo/branches/$branch/protection" \
    > "$OUT/$repo.protection.json" 2>/dev/null
done

gh api --paginate "orgs/$ORG/members?role=admin" > "$OUT/owners.json"
gh api --paginate "orgs/$ORG/members" > "$OUT/members.json"
gh api --paginate "orgs/$ORG/outside_collaborators" > "$OUT/outside.json"
gh api --paginate "orgs/$ORG/teams" > "$OUT/teams.json"

jq -r '.[].slug' "$OUT/teams.json" | while read -r team; do
  gh api --paginate "orgs/$ORG/teams/$team/members" > "$OUT/team-$team.members.json"
  gh api --paginate "orgs/$ORG/teams/$team/repos" > "$OUT/team-$team.repos.json"
done
```

Things to know about the export:

- The default branch comes from the API instead of being assumed to be `main`, and failures are reported per repository instead of aborting the run or being swallowed.
- Git LFS objects are not in a plain clone. If you use LFS, add `git lfs fetch --all` before bundling.
- The issues endpoint also returns pull requests. `issues/comments` and `pulls/comments` are the conversations.
- `teams.json` carries each team's parent, which you need to rebuild the hierarchy.
- Secrets can be listed by name but their values cannot be read through the API. The backup tells you which secrets existed. The values have to come from wherever you originally store them.

Encrypt the output with `age` (`tar c "$OUT" | age -r ... > github-20261021.tar.age`) and push it to the same write-only bucket as the databases.

## THE DAY-ZERO KIT

Scenario three starts with nothing. Make a list of what you need before you can touch the off-site copy, and keep each item somewhere that does not depend on the rack:

- the `age` private key (`recovery.key`) for decrypting backups, plus the second escrow key if you use two recipients
- a restore-only credential for the bucket, separate from the writer
- the cloud account and DNS registrar logins, with the MFA recovery codes
- the runbook itself, as a file you can read without your wiki
- the way to reach at least two other people who hold part of the above

A password manager that runs in your rack cannot hold the key to restore your rack. A workable setup is a small printed set sealed in envelopes in two physical locations, plus the `age` key split with Shamir's secret sharing so that no single person holds it. A 2-of-3 split among three people means losing or compromising one of them is survivable in both directions.

Split only the secret line, not the whole key file, which starts with comment lines:

```bash
grep '^AGE-SECRET-KEY-' recovery.key | ssss-split -t 2 -n 3 -Q
```

`ssss-split` prints three shares, one per person. To recombine, paste any two when prompted, and write the result straight to a memory-backed location:

```bash
ssss-combine -t 2 -Q > /run/user/$UID/recovery.key
```

I have always loved those movie scenes where a few generals break their seals, enter their parts of the code and launch the nukes. The same idea, minus the nukes, is a pretty good way to protect a backup key.

Test that the pieces recombine and that the recombined key decrypts a real backup. The first time you try this should not be during an incident.

## RESTORE ORDER IS A DEPENDENCY GRAPH

After a total loss the order matters, because each layer needs the one before it. The order I would write down is:

1. Network basics: addressing, routing, a place to run compute (a rented host, a colo box, even a laptop for the first hour)
2. DNS and time
3. The internal certificate authority, since everything after this trusts it
4. Identity
5. Secrets and configuration
6. Data stores
7. Applications
8. CI and developer tooling

The classic trap is step 3. If services use certificates from an internal CA (I wrote about [running a small one](/blog/internal-ca-step-ca/)), then the root and intermediate keys plus the CA's own configuration are part of the day-zero kit, because without them you re-issue trust for every host and every laptop. Same for the identity provider: if logging in needs the identity provider and the identity provider's restore needs a login, you have a loop to break in advance, with a documented local admin path.

Write the graph down and put an estimate next to each step. Then do it for real.

## MEASURING THE PART NOBODY MEASURES

Most plans guess the transfer time and stop. Do the arithmetic. Restoring 4 TB over a 500 Mbit/s link takes about

```text
4e12 bytes * 8 / 500e6 bits/s = 64000 s = ~17.8 hours
```

before decryption, before the restore itself and assuming the link is actually saturated. If the target RTO is four hours, then either the data set needs to shrink (restore the critical datasets first and the archive later), the copy needs to be somewhere closer, or the target is fiction. Finding that out on paper is free, finding it out during an outage is not.

## RESTORE RECIPES

Assuming you know the basics, these are the operations worth having written down before you need them. Run every one of them once, with the offline key, on a scratch machine, and write down how long it took.

### FETCH THE COPY YOU NEED

Because the file names carry a sortable UTC timestamp, "latest" is the last name in alphabetical order. `aws s3 ls` pages through the whole prefix, so this keeps working past 1000 objects, which the WAL prefix will exceed quickly:

```bash
newest() {
  aws s3 ls "s3://acme-offsite-backups/$1" | awk '{print $4}' | sort | tail -1
}
aws s3 cp "s3://acme-offsite-backups/db/appdb/$(newest db/appdb/)" .
```

The newest copy from before an incident, for when last night's backup is already poisoned:

```bash
aws s3 ls s3://acme-offsite-backups/db/appdb/ | awk '{print $4}' | sort \
  | awk '$0 < "appdb-20261015T0000Z"' | tail -1
```

Check when the object really arrived and until when it is locked. The name is chosen by whoever uploaded it, the timestamp and retention are set by the bucket:

```bash
aws s3api head-object --bucket acme-offsite-backups \
  --key db/appdb/appdb-20261015T0200Z.dump.age \
  --query '[LastModified,ContentLength,ObjectLockRetainUntilDate]'
```

If an object you expected is missing, `aws s3api list-object-versions --prefix db/appdb/` shows versions and delete markers, which tells you whether something tried to remove it.

### DECRYPT WITH AGE

Straight from the bucket, without leaving a ciphertext copy on disk:

```bash
aws s3 cp s3://acme-offsite-backups/db/appdb/appdb-20261015T0200Z.dump.age - \
  | age -d -i /run/user/$UID/recovery.key > appdb.dump
```

`no identity matched any of the recipients` means the file was encrypted to a different public key than the one you hold. Record it as a finding rather than working around it: it usually means someone rotated the production key and did not rotate the escrow.

### POSTGRES: LOOK FIRST, THEN RESTORE THE SMALLEST THING

Inspect a dump without restoring it:

```bash
pg_restore --list appdb.dump | grep -E 'TABLE DATA.* (orders|invoices) '
```

One table back from yesterday. Restore it into a scratch database, then merge into production without overwriting rows that changed since:

```bash
createdb scratch
pg_restore -d scratch -t orders --no-owner appdb.dump
psql -d scratch -c "\copy orders to 'orders.csv' csv header"
```

```sql
-- on production
create temp table orders_old (like orders);
\copy orders_old from 'orders.csv' csv header
insert into orders select * from orders_old on conflict (id) do nothing;
```

`-t` restores only that table: it ignores dependent objects, and for tables outside the `public` schema you need `-n schema` as well. Rows deleted by mistake come back, rows that were edited since keep their new values. Swap `do nothing` for `do update` if you want the old version to win.

Point-in-time recovery needs the base backup unpacked as the new data directory, then tells Postgres where to find the WAL and when to stop. `restore_command` also runs as `postgres`, so that user needs the restore credential and a readable copy of the key, and both should exist only for the duration of the recovery:

```text
restore_command = '/usr/local/bin/fetch-wal %f %p'
recovery_target_time = '2026-10-15 13:45:00+00'
recovery_target_action = 'promote'
```

```bash
#!/usr/bin/env bash
# fetch-wal: download and decrypt one WAL segment
set -euo pipefail
aws s3 cp "s3://acme-offsite-backups/wal/appdb/$1.age" - \
  | age -d -i /var/lib/postgresql/recovery.key > "$2"
```

```bash
touch "$PGDATA/recovery.signal" && pg_ctl -D "$PGDATA" start
```

"File not found" errors from `restore_command` for `.history` files, and one at the very end when WAL runs out, are normal. If Postgres stops with "recovery ended before configured recovery target was reached", the WAL you needed was never archived, which is the thing the drill exists to find.

### GIT: FROM A BUNDLE TO A LIVE REPOSITORY

```bash
git bundle verify acme-api.bundle
git clone --mirror acme-api.bundle acme-api.git
```

When pushing to a new, empty repository, note that a bundle made from a GitHub mirror contains `refs/pull/*`. GitHub refuses those hidden refs, so `git push --mirror` reports errors and exits non-zero even though the other refs went through. Push only what you want, which also gives you a clean exit status:

```bash
git -C acme-api.git push git@github.com:acme/acme-api.git \
  'refs/heads/*' 'refs/tags/*'
```

To roll a single branch back to a known-good commit after a force-push, instead of replacing the whole repository:

```bash
git -C acme-api.git push git@github.com:acme/acme-api.git \
  <good-sha>:refs/heads/main --force
```

### GITHUB ORG: MEMBERS, TEAMS, PERMISSIONS

Members come back as invitations, since you cannot add someone to an organization without them accepting. Owners are listed separately in the export (the script saved them in `owners.json`), so restore the roles in two passes:

```bash
jq -r '.[].login' members.json | while read -r u; do
  gh api -X PUT "orgs/acme/memberships/$u" -f role=member >/dev/null
done
jq -r '.[].login' owners.json | while read -r u; do
  gh api -X PUT "orgs/acme/memberships/$u" -f role=admin >/dev/null
done
```

Outside collaborators are in `outside.json` and have to be re-added per repository with `PUT repos/acme/REPO/collaborators/USER`.

Teams, with their members and repository access. Create parent teams before children, and pass the parent's id when you do (the id changes in the new org, so look it up by slug):

```bash
jq -r '.[] | [.name, .slug, .privacy] | @tsv' teams.json |
while IFS=$'\t' read -r name slug privacy; do
  gh api -X POST orgs/acme/teams -f name="$name" -f privacy="$privacy" >/dev/null

  jq -r '.[].login' "team-$slug.members.json" | while read -r u; do
    gh api -X PUT "orgs/acme/teams/$slug/memberships/$u" \
      -f role=member >/dev/null
  done

  jq -r '.[] | [.name, (.permissions |
      if .admin then "admin" elif .maintain then "maintain"
      elif .push then "push" elif .triage then "triage" else "pull" end)]
      | @tsv' "team-$slug.repos.json" |
  while IFS=$'\t' read -r repo perm; do
    gh api -X PUT "orgs/acme/teams/$slug/repos/acme/$repo" \
      -f permission="$perm" >/dev/null
  done
done
```

Branch protection needs reshaping, because the `GET` response is not valid `PUT` input (`enforce_admins` is an object in one and a boolean in the other, and the optional switches are objects with an `enabled` field):

```bash
jq '{
  required_status_checks: (.required_status_checks // null
    | if . then {strict, contexts} else null end),
  enforce_admins: .enforce_admins.enabled,
  required_pull_request_reviews: (.required_pull_request_reviews // null
    | if . then {
        required_approving_review_count,
        dismiss_stale_reviews,
        require_code_owner_reviews
      } else null end),
  restrictions: null,
  required_linear_history: (.required_linear_history.enabled // false),
  allow_force_pushes: (.allow_force_pushes.enabled // false),
  allow_deletions: (.allow_deletions.enabled // false),
  required_conversation_resolution:
    (.required_conversation_resolution.enabled // false)
}' acme-api.protection.json \
  | gh api -X PUT repos/acme/acme-api/branches/main/protection --input -
```

This covers the common settings, not push restrictions or bypass lists. Rulesets are exported as their own JSON and can be re-created with `POST repos/acme/REPO/rulesets` after removing the read-only fields (`id`, `source`, `source_type`, `node_id`, `_links`, timestamps).

Issues and pull requests are the part you cannot truly restore. You can recreate them through the API, but authorship, timestamps and numbers will not match the originals. In practice the export is for reading and searching:

```bash
jq -r '.[] | select(.number == 412)
  | "#\(.number) \(.title)\n\(.user.login) \(.created_at)\n\n\(.body)"' \
  acme-api.issues.json
jq -r '.[] | select(.title | test("webhook"; "i"))
  | "#\(.number) \(.state) \(.title)"' acme-api.issues.json
```

The organization migrations API archive exists, but it is aimed at importing into a GitHub Enterprise Server instance, not back into github.com. For moving between GitHub organizations with issues and pull requests intact, look at GitHub Enterprise Importer (`gh gei`), and check its current limits for your case before you rely on it.

### KEEP A RECORD, AND WATCH THE SILENCE

Each recipe above ends the same way: write down the backup you used, the elapsed time and the result of one sanity check, as a ticket. The full drill needs the offline private key, so it stays a manual, scheduled exercise. Wiring that key into a cron job on a production machine undoes the point of encrypting to a public key.

What can run every night without the key is a freshness check on the bucket side. It reads the bucket's own timestamp, not the one in the file name:

```bash
key=db/appdb/$(aws s3 ls s3://acme-offsite-backups/db/appdb/ \
  | awk '{print $4}' | sort | tail -1)
aws s3api head-object --bucket acme-offsite-backups --key "$key" \
  --query '[LastModified,ContentLength]' --output text
```

Alert if the newest `LastModified` is older than about 26 hours, or `ContentLength` dropped sharply versus yesterday. The failure that bites in practice is silence: a job that stopped running reports no error, so alert on the absence of a fresh object, not on a failure message.

Run the three scenarios on a schedule and file what you measured: a single-object restore, a restore with only the write-only copy and the offline key, and a bootstrap onto different hardware. Put the measured time next to the target every time, because the gap is the useful number.

## WHERE THIS LEAVES YOU

Production can write backups and can never read or delete them. The key to read them back is held by people instead of by the system, and the order of recovery is written down with times on it.

A backup is not what your system does every night, it is what you can still do on the worst day.
