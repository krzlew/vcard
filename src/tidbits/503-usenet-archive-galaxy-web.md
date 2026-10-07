---
layout: layouts/tidbit.njk
pageNumber: P503
extensionText: "503: USENET ARCHIVE + GALAXY-WEB"
title: Reading the Polish Usenet archive with galaxy-web
number: 503
date: 2026-10-07
updated: 2026-10-07
summary: Nostalgia led me to the Polish Usenet archives, and a missing browser UI led to galaxy-web, which is now part of usenetarchive.
permalink: /tidbits/usenet-archive-galaxy-web/
---
A LinkedIn thread about `pl.pregierz`, the Polish newsgroup where people went to publicly shame and condemn things, set off a wave of nostalgia. I went looking for its archives, and since I collect things and have a soft spot for old computer days, a quick look ended with me downloading all of it.

## A BIT OF USENET

Usenet is a distributed discussion system that predates the web: newsgroups organised in hierarchies (`pl.*`, `alt.*`), threaded messages, read with a newsreader over NNTP. The Polish side was big. By the [Kluska article on Usenet's Polish beginnings](https://kluska.substack.com/p/usenet-poczatek-orki), the `pl.*` hierarchy saw nearly 20,000 posts a day around the turn of the millennium, with strict moderation, "lurk before you post" etiquette and a culture that slowly slid into trolling.

`pl.pregierz` was the group for shaming and condemning. Its [FAQ](http://pregierz.is.evil.pl/) is a 2005 page, version 2.5, and looks exactly as old as it is.

## THE ARCHIVE

[usenet.nereid.pl](https://usenet.nereid.pl/) hosts archives of Polish Usenet: 333 groups (274 `pl.*`, 58 `alt.*` and `soc.culture.polish`) as `.usenet.xz` files, plus a `galaxy.7z` of about 1.1 GiB. The usenetarchive README lists it as the Polish archive, and the author's address in the license is on the same domain. I downloaded all of it, including `pl.pregierz`, which alone is 2.5 GB unpacked, and the whole collection takes 66 GB on disk.

To read them I found [usenetarchive](https://github.com/wolfpld/usenetarchive) by wolfpld, a toolkit that turns raw newsgroup archives into indexed ones you can browse and search locally. wolfpld is also an old PLD Linux Distribution developer, and PLD has a special place in my heart.

## WHY UAT ARCHIVES ARE NICE

The README starts from a blunt premise: Usenet is dead, old discussions are rotting in Google Groups, and there is no easy way to get the data, browse it or search it. The archive format has a few nice properties:
- messages are compressed individually for instant access, with a dictionary shared across the archive, so the total is smaller than the raw messages
- search uses a word lexicon with hit tables, a design the README compares to Google's original paper
- duplicates, stray messages from other groups and (optionally) spam are filtered out, and everything is transcoded to UTF-8, including messages with broken headers or bad encodings
- thread connectivity is precalculated, and missing links can be rebuilt by looking for quoted text in other messages
- archives are memory-mapped, so `tbrowser` needs about 10 bytes per message, around 25 MB for a group with 2.5 million messages

## THE MISSING BROWSER

usenetarchive comes with `tbrowser`, a curses TUI, and a small web component that opens a message in the browser if you already know its message ID. Fine for a lookup, painful for browsing: I wanted to pick a group, scroll through threads and search.

So I added **galaxy-web**, a browser UI for the archives, as a small contribution to the project ([PR #3](https://github.com/wolfpld/usenetarchive/pull/3)). It has:
- a list of newsgroups with message and thread counts
- paginated thread lists, 50 per page
- nested thread views with permalinks for single messages
- full-text search across all groups or inside one, using each archive's built-in lexicon, so no extra index is needed
- message-ID routing, so links in old posts can resolve

The review included testing against a real galaxy of 333 newsgroups, plus fixes for buffer overflow protection and installation.

## SCREENSHOTS

The group listing, a group's thread list and a threaded message view. Click to enlarge.

<div class="project-shots">
<picture><source srcset="/images/tidbits/usenet/group-list.webp" type="image/webp"><img src="/images/tidbits/usenet/group-list.png" alt="galaxy-web newsgroup listing" loading="lazy"></picture>
<picture><source srcset="/images/tidbits/usenet/thread-list.webp" type="image/webp"><img src="/images/tidbits/usenet/thread-list.png" alt="galaxy-web thread list of a newsgroup" loading="lazy"></picture>
<picture><source srcset="/images/tidbits/usenet/thread-view.webp" type="image/webp"><img src="/images/tidbits/usenet/thread-view.png" alt="galaxy-web threaded message view" loading="lazy"></picture>
</div>

## SETUP

Build the tools first. The `CMakeLists.txt` wants CMake 3.29 or newer, a C++17 compiler and these libraries via `pkg-config`: libcurl, OpenSSL, ICU, ncursesw, GMime 3 and lz4. Tracy is pulled in by CMake itself. On macOS I already had all of them from Homebrew (`cmake`, `pkgconf`, `curl`, `openssl@3`, `icu4c`, `ncurses`, `gmime`, `lz4`), so this was enough:

```bash
git clone https://github.com/wolfpld/usenetarchive.git
cd usenetarchive
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

That produces `tbrowser`, `web`, `galaxy-util` and `galaxy-web` in `build/`.

The simplest way to read one archive is `tbrowser`. It opens a `.usenet` file and remembers it between sessions:

```bash
build/tbrowser ~/Usenet/archives/pl.pregierz.usenet
```

To browse everything together you need a galaxy: a directory with cross-reference data for a set of archives, which is what lets the tools show crossposts and followups across groups. Create a directory, put an `archives` file in it with one archive path per line, and run `galaxy-util` on it:

```bash
mkdir ~/Usenet/galaxy
ls ~/Usenet/archives/*.usenet > ~/Usenet/galaxy/archives
build/galaxy-util ~/Usenet/galaxy
```

Use absolute paths in the `archives` file (the shell expands `~` for you), because the tools open them as written, relative to wherever you run them. For my 333 archives, `galaxy-util` filled the directory with about 2.6 GB of index files (`msgid`, `midhash`, `midgr` and friends). Indexing 66 GB of archives takes a while. All archives must be present while it runs, but afterwards they are only needed for reading.

`galaxy-web` reads a small INI file:

```ini
[server]
bind = 127.0.0.1
port = 8119

[galaxy]
path = /home/me/Usenet/galaxy
```

Start it with:

```bash
build/galaxy-web ~/Usenet/galaxy/config.ini
```

With this config the archive is at http://127.0.0.1:8119/. Both `bind` and `port` are optional and default to `127.0.0.1` and `8120`. The server runs in the foreground, so use `tmux` or run it in the background if you want it to keep going.
