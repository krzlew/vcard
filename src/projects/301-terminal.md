---
layout: layouts/project.njk
pageNumber: P301
extensionText: "301: TERMINAL"
permalink: /projects/terminal/
title: TERMINAL
number: 301
tech: Proxmox VE / Home Assistant / AdGuard Home / Cloudflared
status: ACTIVE
summary: A repurposed thin client running the homelab
---
A DELL Wyse 5070 thin client — Pentium J5005, 8GB DDR4, 128GB storage
— quietly running the homelab in a box smaller than a router.

## OVERVIEW

Proxmox VE as the hypervisor, with a handful of small VMs/containers
doing the actual work: Home Assistant for home automation, AdGuard
Home for network-wide ad and tracker blocking, and a Cloudflare
Tunnel (cloudflared) for exposing select services without opening
ports.

## WHY A THIN CLIENT

Low power draw, silent, and more than enough headroom for
lightweight always-on services — no need for a full tower for
things that just need to stay up.
