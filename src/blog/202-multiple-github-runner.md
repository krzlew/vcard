---
layout: layouts/post.njk
pageNumber: P202
extensionText: "202: MULTIPLE GITHUB RUNNERS"
title: Multiple GitHub Runners on a Single Machine
number: 202
date: 2026-09-07
tags: [GITHUB, SELF-HOSTED, RUNNER]
summary: Running several self-hosted GitHub Actions runners on one box via a GitHub App instead of a PAT
permalink: /blog/multiple-github-runners/
---
## PROBLEM

After GitLab changed its pricing, I migrated our organization's
repositories to GitHub. One of the bigger issues in that migration
was setting up self-hosted runners.

GitLab's runner is a single binary with a simple TOML config and
just works. [GitHub's self-hosted runner](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)
is a lot more involved — bash scripts, hundreds of .NET Core DLLs,
and a more complicated setup overall. GitLab's runner also has a
`concurrent` parameter to run multiple jobs in parallel; GitHub's
doesn't have an equivalent, so running several jobs at once means
running several runner instances.

Here's how I set that up.

## SUMMARY

[myoung34/docker-github-actions-runner](https://github.com/myoung34/docker-github-actions-runner)
handles this well — self-spawning, self-hosted GitHub Actions
runners in Docker, with Docker-in-Docker support.

Usage docs: [docker-github-actions-runner usage](https://github.com/myoung34/docker-github-actions-runner/wiki/Usage)

## SETUP

I avoided using a personal access token (PAT) tied to a person's
account for organization-wide runners, and used a GitHub App
instead. You'll need the Owner role on the GitHub organization to
set one up.

### 1. Create the app under your organization

Create it at the organization level (not your personal account) so
ownership stays tied to the org, not to you.

1. Go to `https://github.com/organizations/<your-org>/settings/apps`
2. Click **New GitHub App**
3. Fill in an app name (e.g. `org-runner-manager`) and homepage URL
4. Under **Webhook**, uncheck **Active** unless you actually want event-driven runners

### 2. Configure permissions

**Repository permissions:**

- Administration: Read & write (needed for runner registration at repo scope)
- Actions: Read-only
- Metadata: Read-only (default)

**Organization permissions** (required for org-wide runners):

- Self-hosted runners: Read & write
- Organization administration: Read-only (or Read & write to manage runner groups)
- Organization custom repository roles: Read-only (optional, enterprise only)

Under "Where can this GitHub App be installed?", choose **Only on
this account**, then click **Create GitHub App**.

### 3. Get the App ID and generate a private key

1. On the app's General settings page, note the numeric **App ID**
2. Scroll to **Private keys**, click **Generate a private key**
3. GitHub downloads a `.pem` file — keep it secure

### 4. Install the app on the organization

1. In the sidebar, click **Install App**
2. Install it on your organization
3. Choose repository access — all repos, or only selected ones
4. Verify at `https://github.com/organizations/<your-org>/settings/installations`

### 5. Run the runner container

The image handles JWT creation, token exchange, and registration
automatically from the App credentials:

```bash
export APP_PRIVATE_KEY_CONTENTS="$(cat /path/to/org-runner-manager.*.private-key.pem)"

docker run -d --restart always --name github-runner-org \
  -e RUNNER_SCOPE="org" \
  -e ORG_NAME="your-organization" \
  -e APP_ID="1313114" \
  -e APP_PRIVATE_KEY="${APP_PRIVATE_KEY_CONTENTS}" \
  -e APP_LOGIN="your-organization" \
  -e RUNNER_NAME="org-runner-01" \
  -e LABELS="self-hosted,linux,docker" \
  -e UNSET_CONFIG_VARS="true" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/runner-work:/tmp/runner-work \
  myoung34/github-runner:latest
```

- `APP_LOGIN` is the org slug or user login the App is installed under
- `UNSET_CONFIG_VARS="true"` purges the private key and generated
  tokens from the container's environment after the runner boots,
  so workflow jobs can't read them

### Running several replicas

For running multiple runner instances on one machine, a compose
file with `replicas` is simpler than managing individual `docker
run` commands. Rough shape (trim the org-specific bits — CA cert,
Gradle/Java tuning — to whatever applies to you):

```yaml
services:
  runner:
    image: myoung34/github-runner:latest
    privileged: true
    restart: always
    stop_grace_period: 2m
    volumes:
      - /var/lib/docker
    ulimits:
      nofile:
        soft: 524288
        hard: 524288
    environment:
      EPHEMERAL: "1"
      DISABLE_AUTO_UPDATE: "true"
      RUNNER_SCOPE: org
      ORG_NAME: your-organization
      APP_ID: ${APP_ID}
      APP_PRIVATE_KEY: ${APP_PRIVATE_KEY}
      RUNNER_NAME_PREFIX: linux-runner
      RANDOM_RUNNER_SUFFIX: "true"   # so replicas don't collide on name
      LABELS: self-hosted,Linux
    logging:
      driver: json-file
      options: { max-size: "50m", max-file: "3" }
    deploy:
      replicas: 6
    mem_limit: 16g
    cpus: 4
```

`replicas: 6` with `RANDOM_RUNNER_SUFFIX` gives six independent
runners registered under distinct names, all pulling jobs from the
same org queue.
