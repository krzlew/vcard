---
layout: layouts/post.njk
pageNumber: P204
extensionText: "204: GITHUB OIDC TO AWS AND AZURE"
title: "GitHub OIDC to AWS and Azure: no more static cloud keys"
number: 204
date: 2026-09-23
tags: [AWS, AZURE, GITHUB, RUNNER]
summary: Setting up GitHub OIDC federation to AWS and Azure, so CI workflows get short-lived scoped credentials instead of static cloud keys
permalink: /blog/oidc-aws-azure/
---
## PROBLEM

Before OIDC federation, every deploy workflow carried long-lived cloud
credentials. On AWS it was an access key pair stored in an Actions
secret; on Azure a client secret in an app registration. Both had the
same two problems:

- They never expire unless you make them expire, and nobody rotates
  secrets that haven't caused an incident yet.
- The credential is scope-free at the point of use. Whatever the key
  can do, any workflow in the repository can do, on any branch, forever.

In a software house building medical software, this also shows up in
audits: "who could have touched production with this credential, and
when?" A static key in a GitHub secret has an answer nobody likes -
"any workflow in the repo, since we created it, and we don't log that."

So the goal: no static cloud credentials in CI at all. Workflows
exchange a short-lived GitHub-issued token for a scoped cloud session,
scoped per repository and per branch (or, for production, per GitHub
Environment), and every exchange is logged on the cloud side.

## SUMMARY

GitHub Actions can mint a signed OIDC token for every job
(`https://token.actions.githubusercontent.com`). AWS IAM and Azure
Entra ID both trust that issuer natively. You register the issuer once
per cloud, attach a trust policy that names your repository and branch,
and then workflows assume a role / identity at deploy time with
`permissions: id-token: write`. The credential lives for about an hour,
is scoped by the trust policy, and every use lands in CloudTrail or
Entra sign-in logs - which doubles as ISO 27001 audit evidence.

This follows naturally from the [self-hosted runners
setup](/blog/multiple-github-runners/): runners no longer need any
cloud secret in their environment either. The only credential the
runner ever sees is the short-lived session it assumes itself.

## SETUP - AWS

### 1. Register the OIDC provider

Once per account:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

Run once per AWS account, in whatever region you manage IAM from - IAM
is a global service, so this isn't a per-region step. `[ACCOUNT]` below
is that account's 12-digit ID.

### 2. Create a role per repository

Resist the single god-role. First the trust policy - the `sub` claim
is the whole game:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::[ACCOUNT]:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:ref:refs/heads/main"
      }
    }
  }]
}
```

Then create the role from that trust policy and attach only the
permissions that repo's deploy actually needs:

```bash
aws iam create-role \
  --role-name deploy-your-repo \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name deploy-your-repo \
  --policy-arn arn:aws:iam::[ACCOUNT]:policy/deploy-your-repo-permissions
```

Repeat per repo/branch. `StringLike` supports patterns if you want to
allow `release/*` branches too - keep the pattern tight.

### 3. The workflow

```yaml
permissions:
  id-token: write   # this line is the OIDC mint switch
  contents: read

jobs:
  deploy:
    runs-on: [self-hosted, linux]
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::[ACCOUNT]:role/deploy-your-repo
          aws-region: eu-central-1
          role-session-name: gha-{% raw %}${{ github.run_id }}{% endraw %}
      - run: aws sts get-caller-identity   # sanity check
```

No secrets block. Nothing to rotate. Key created 90 days ago in some
onboarding doc - gone.

### 4. Audit: check for leftovers

```bash
aws iam list-users --query 'Users[?PasswordLastUsed==null]'
```

Then delete any access key whose last-used date predates the OIDC
cutover. CloudTrail will now show `AssumeRoleWithWebIdentity` events
instead of `AssumeRole` with a static key - that's your evidence
trail for access reviews.

## SETUP - AZURE

Azure calls the same thing federated identity credentials, attached to
an app registration or (nicer, see step 3) a user-assigned managed
identity. The steps below use a managed identity throughout.

### 1. Create the managed identity and attach the federation

```bash
az identity create \
  --name gha-deploy-your-repo \
  --resource-group your-resource-group

az identity federated-credential create \
  --identity-name gha-deploy-your-repo \
  --resource-group your-resource-group \
  --name gha-your-repo-main \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:your-org/your-repo:ref:refs/heads/main \
  --audiences api://AzureADTokenExchange
```

The `subject` format is identical to AWS's `sub` claim - same
`repo:org/name:ref:...` grammar, learn once use twice. Note the
`client-id` on the identity you just created; the workflow below
needs it.

### 2. The workflow

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: [self-hosted, linux]
    steps:
      - uses: azure/login@v2
        with:
          client-id: [MANAGED_IDENTITY_CLIENT_ID]
          tenant-id: [TENANT_ID]
          # no client-secret. that's the point.
      - run: az account show
```

### 3. Why a managed identity over an app registration

An app registration still has owners who could attach a client secret
to it later - the federation doesn't remove that door, it just adds
another one. A user-assigned managed identity, as far as I've been
able to confirm, has no client-secret mechanism at all: there's no
"add a secret" option in the portal or CLI for it, so federation is
the only credential path in. I haven't tested this against every
tenant policy or Bicep-managed setup, so if your org enforces custom
restrictions on managed identities, verify against your own tenant
before relying on it.

## WHAT DIDN'T WORK / GOTCHAS

- `AADSTS70021: No matching federated identity record found` - the
  classic. 90% of the time it's the subject string. GitHub sends
  `repo:org/name:ref:refs/heads/main` - full `ref:` prefix, full ref
  path. A trust policy that expects just `main` or `refs/heads/main`
  without the `repo:` prefix matches nothing. The error message
  doesn't tell you which part mismatched; decode the token from the
  failing job (print it with a debug step, then rotate nothing - it's
  expired already) and compare claim by claim.
- On AWS the equivalent failure is `Not authorized to perform
  sts:AssumeRoleWithWebIdentity` - same cause, same debugging. Also:
  forgetting `permissions: id-token: write` on the job produces a
  token-less runner and the exact same error, which sends you
  debugging the trust policy when the policy is fine.
- The AWS thumbprint rabbit hole. Older guides (including AWS's own)
  had you pin a server certificate thumbprint on the OIDC provider.
  AWS then rotated their trusted CA set and broke setups that had
  pinned it. Today AWS fetches GitHub's trusted roots automatically
  and the thumbprint field is effectively ignored - don't set one,
  and if an old provider has one, that's a migration item, not a
  safety feature.
- Fork pull requests. A fork PR could otherwise mint tokens for
  `repo:your-org/your-repo:refs/pull/N/merge`. GitHub's default
  behavior here is correct: workflows triggered by fork PRs cannot
  request `id-token: write` at all. Don't work around this; it's one
  of the few trust boundaries the platform enforces for you.
- The self-hosted runner nuance (this is where it connects to
  [multiple GitHub runners](/blog/multiple-github-runners/)): the
  OIDC token is minted by GitHub server-side, so the trust policy
  still keys off the *calling repository*, not the runner. But with
  shared org-level runners, any repo in the org can run a job on your
  hardware - and if its trust policy is broad, any repo in the org
  can get cloud credentials too. The fix is not runner-side. Per-repo
  roles with tight `sub` conditions, plus GitHub Environments with
  required reviewers for anything production-shaped. The runner being
  self-hosted changes nothing about the token's identity - that's the
  design working as intended, not a hole.

## HARDENING CHECKLIST

- One role / federated credential per repo+branch. No shared deploy
  role across repos.
- Prod deploys go through a GitHub Environment with required
  reviewers; the trust policy then pins `environment:prod` instead of
  a branch - reviewer approval becomes part of the credential mint.
- Cap session length (`--duration-seconds`, default 1h) to what the
  deploy actually takes.
- `role-session-name: gha-{% raw %}${{ github.run_id }}{% endraw %}` - every CloudTrail
  entry then maps 1:1 to a workflow run. Free traceability, which in
  SaMD-land is the difference between "we have logs" and "we have
  evidence".

## CONCLUSION

The static key was an identity problem, not a CI one. After the
cutover, "who could deploy to production and when" has a concrete
answer in CloudTrail or Entra sign-in logs, and there's nothing left
in a secrets store to rotate, leak, or forget.
