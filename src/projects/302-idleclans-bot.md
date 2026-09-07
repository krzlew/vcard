---
layout: layouts/project.njk
pageNumber: P302
extensionText: "302: IDLECLANS BOT"
permalink: /projects/idleclans-bot/
title: IDLECLANS BOT
number: 302
tech: Python / discord.py
status: MAINTAINED
summary: Discord bot for Idle Clans, still running for my old clan
---
A Discord bot for [Idle Clans](https://idleclans.com/), built for my
own in-game clan — mostly for stats. I've since stopped playing, but
the bot is still running and the clan still uses it.

## OVERVIEW

Slash commands and scheduled tasks pull clan and player data from
the game and post it back into Discord: XP tracking, clan activity
logs, and leaderboard-style stats the clan actually looks at.

## STACK

Python with discord.py, polling the game's API on a schedule and
rendering some of the output as images (Pillow + pilmoji) for
readable in-Discord stat cards.
