---
layout: layouts/post.njk
pageNumber: P211
extensionText: "211: SECRETS WITH SOPS AND AGE"
title: "Secrets in git with SOPS and age"
number: 211
date: 2026-11-25
tags: [SOPS, AGE, SECRETS, ANSIBLE]
summary: Keeping secrets for Ansible and shell scripts in git with SOPS and age - readable diffs, no secrets server, and where the private key really lives
permalink: /blog/secrets-sops-age/
---
If your Ansible playbooks and shell scripts need passwords and tokens, and you want them versioned in git next to the code without running a secrets server, SOPS with age does exactly that. You will install both, learn the few commands you use daily, plug them into Ansible instead of Ansible Vault, and add a pre-commit hook that stops you from committing a secret in plain text. It assumes you are comfortable with a terminal and git, and have never used SOPS.

## PROBLEM

Automation needs secrets: database passwords, API tokens, SSH passphrases. They have to live somewhere, and the best place is the same repository as the playbooks that use them, so a change to the code and the secret it needs travel together and show up in one review.

Plain text in git ends up in the history and in every clone. Ansible Vault encrypts a whole file with one shared password, so a diff is a wall of noise and everyone who can decrypt anything can decrypt everything. A secrets server solves both, but now you run, patch and back up one more service.

## WHY SOPS AND AGE

SOPS is a tool that encrypts the values inside a YAML, JSON or dotenv file and leaves the keys alone. Your file still looks like a normal config file, you can see which settings exist and what changed in a commit, and only the secret parts are scrambled.

age is the encryption underneath. It is a small, modern file encryption tool, and the SOPS project itself recommends it over PGP where you can choose. There is no keyring, no key server and no expiry dates, and a key pair fits in one text file. Think of it as an SSH key for encryption.

Together they give you:
- readable diffs, because only values are encrypted
- no server to run, because the files are the storage
- per-person access, because every person has their own key and the file can be decrypted by any of them
- one tool for YAML, JSON and dotenv, so Ansible vars and shell scripts share the same setup

What you do not get is an audit log of who read which secret, or secrets that expire on their own. If you need those, a real secrets server is the better tool.

## INSTALL

On macOS with Homebrew:

```sh
brew install sops age
sops --version
age --version
```

On Linux, grab a SOPS release binary (this example is amd64) and install age from your distribution's package manager:

```sh
export SOPS_VERSION=v3.13.3
curl -LO "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.amd64"
sudo mv "sops-${SOPS_VERSION}.linux.amd64" /usr/local/bin/sops
sudo chmod +x /usr/local/bin/sops
sops --version
```

Some commands used below (`sops edit`, `sops encrypt`, `sops decrypt`) need SOPS 3.9 or newer.

## KEYS AND POLICY

Generate a key pair:

```sh
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt
```

age-keygen prints the public key and writes both halves to `keys.txt`. The public key starts with `age1` and is safe to share and commit. The private key line starts with `AGE-SECRET-KEY-` and is the one thing that decrypts, so treat the file like an SSH private key.

SOPS looks for that file in `~/.config/sops/age/keys.txt` on Linux, but on macOS it defaults to `~/Library/Application Support/sops/age/keys.txt`. The simplest fix on any system is to point at it explicitly:

```sh
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
```

In CI you usually have no file, so put the key text in a secret and expose it as `SOPS_AGE_KEY`.

Next, tell SOPS who may decrypt which files. Put a `.sops.yaml` in the repository root:

```yaml
creation_rules:
  - path_regex: .*\.sops\.ya?ml$
    age: >-
      age1firstpersonpublickey,
      age1secondpersonpublickey
```

SOPS encrypts the values with one random data key, then locks a separate copy of that key for every public key in the list, and each person unlocks theirs with their own private key. Adding a teammate means adding their public key, not sharing a password.

Do not keep the only copy of your private key on the machine that also holds everything it protects. If that disk dies, you lose access to every secret in the repository. Keep a backup in a password manager or on offline media.

## BASICS

Create the file, encrypt it in place, then edit it through SOPS:

```sh
echo 'db_password: hunter2' > secrets.sops.yaml
sops encrypt -i secrets.sops.yaml
sops edit secrets.sops.yaml
```

`sops edit` decrypts to a temporary buffer in your `$EDITOR` and re-encrypts when you save, so the plain text never lands in the working tree. The file on disk now looks like this:

```yaml
db_password: ENC[AES256_GCM,data:0Ej4Xs/pfw==,iv:...,tag:...,type:str]
sops:
    age:
        - recipient: age1...
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
            -----END AGE ENCRYPTED FILE-----
    mac: ENC[AES256_GCM,data:...]
    version: 3.13.3
```

The key stays readable and the value is encrypted. The `sops:` block at the bottom holds the metadata SOPS needs to decrypt, including a checksum that detects tampering. Never edit a value by hand in that file, or the integrity check will no longer match and decryption fails. Always go through `sops edit`.

The commands you will use most:

```sh
# print decrypted content, nothing written to disk
sops decrypt secrets.sops.yaml

# pull out a single value
sops decrypt --extract '["db_password"]' secrets.sops.yaml

# run a program with the values as environment variables
sops exec-env secrets.sops.env './deploy.sh'

# after changing recipients in .sops.yaml
sops updatekeys -y secrets.sops.yaml
```

`exec-env` works best with flat dotenv files. Use it in shell scripts, because the secrets exist only in the environment of the one process and never in a file.

## ADDING AND REMOVING PEOPLE

A new teammate cannot read anything yet, because every file was encrypted for the keys that existed at the time. Giving them access takes three steps, and the first two are theirs.

They generate their own key pair, the same way as before, and keep the private half to themselves:

```sh
age-keygen -o ~/.config/sops/age/keys.txt
```

They send you only the public key, the `age1...` line printed on screen. It is safe to paste into chat or email.

Then someone who can already decrypt the files adds that public key to `.sops.yaml` and re-encrypts every secrets file for the new list:

```sh
# add the new age1... key to the list in .sops.yaml, then:
find . -name '*.sops.*' -not -path './.git/*' \
  -exec sops updatekeys -y {} \;
git commit -am "Give new teammate access to secrets"
```

`updatekeys` adds a copy of the data key for the new recipient without touching the secret values, so the diff shows only the `sops:` metadata. Once the new teammate pulls the commit and has their key in place (`SOPS_AGE_KEY_FILE`, see above), `sops decrypt` works for them. Until you run `updatekeys`, their key in `.sops.yaml` does nothing, because existing files only change when re-encrypted.

When someone leaves, do the reverse: delete their public key from `.sops.yaml` and run the same `updatekeys` loop. That only stops them decrypting new versions of the files. They may have copies of the old ones from git history and have already read the values, so change the secrets themselves too, and run `sops rotate -i` on each file to give it a fresh data key.

## USING IT WITH ANSIBLE INSTEAD OF VAULT

Ansible talks to SOPS through the `community.sops` collection:

```sh
ansible-galaxy collection install community.sops
```

Name your encrypted vars files `*.sops.yaml` and keep them next to the plain ones, for example `group_vars/prod/secrets.sops.yaml`. Then enable the vars plugin in `ansible.cfg`:

```ini
[defaults]
vars_plugins_enabled = host_group_vars, community.sops.sops
```

The built-in `host_group_vars` plugin also picks up `*.sops.yaml` files and would load the still-encrypted values, so the order of the list matters: put `community.sops.sops` after it so the decrypted values win. From then on the variables behave like any other: `{% raw %}{{ db_password }}{% endraw %}` in a playbook just works, and Ansible needs your age key in `SOPS_AGE_KEY_FILE` or `SOPS_AGE_KEY`.

To read one value from a specific file instead, use the lookup:

```yaml
{% raw %}
password: "{{ lookup('community.sops.sops', 'secrets.sops.yaml', extract='[\"db_password\"]') }}"
{% endraw %}
```

A few gotchas:
- `vars_files` and `include_vars` do not understand SOPS. Use the vars plugin or the `community.sops.load_vars` module instead.
- The plugin adds a top-level variable called `sops` holding the metadata, so do not name your own variable that.
- Give each CI environment its own age key and list only that key in the matching rule, so a staging runner cannot decrypt production files.

Compared with Ansible Vault, there is no shared password to hand around, access is per person, and the diffs are readable. The cost is one extra binary and one collection to install, and Vault needs neither.

## A PRE-COMMIT HOOK THAT CATCHES PLAIN TEXT

A common mistake is committing a secrets file before encrypting it. A git hook can stop that. This script runs before every commit and rejects any staged `*.sops.*` file that does not look encrypted:

```sh
#!/usr/bin/env bash
# Block commits of *.sops.* files that are not encrypted.
status=0
while IFS= read -r -d '' f; do
  if ! grep -q 'ENC\[AES256_GCM,' "$f" \
     || ! grep -Eq '^sops:|"sops":|^sops_mac=' "$f"; then
    echo "NOT ENCRYPTED: $f" >&2
    status=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACM -z \
  -- '*.sops.yaml' '*.sops.yml' '*.sops.json' '*.sops.env')
exit $status
```

It requires both encrypted values and the `sops` metadata block, which every file SOPS writes has. Save it as `.githooks/pre-commit`, make it executable and tell git to use that folder:

```sh
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

Trying to commit a plain `secrets.sops.yaml` now fails with `NOT ENCRYPTED: secrets.sops.yaml`, and the same file after `sops encrypt -i` goes through. The check is deliberately simple. It will not notice a plain value mixed into an otherwise encrypted file, but it catches the most likely mistake, forgetting to encrypt.

Hooks live on each person's machine and `--no-verify` skips them, so run the same script in CI as well. The hook is the fast feedback and CI is the safety net.

## WRAPPING UP

Good secret management is mostly about making the safe path the easy one. With SOPS and age, the encrypted file is the normal file, and a hook reminds you when you forget.
