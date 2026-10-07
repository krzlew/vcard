---
layout: layouts/tidbit.njk
pageNumber: P504
extensionText: "504: DONOSY ARCHIVE"
title: Rebuilding the Donosy archive, 1989-2025
number: 504
date: 2026-10-07
updated: 2026-10-07
summary: A Usenet group led me to Donosy, a daily Polish news bulletin that ran for 36 years, and to an archive of 6313 of its 6949 issues.
permalink: /tidbits/donosy-archive/
---
While clicking through newsgroups in galaxy-web (see the [previous tidbit](/tidbits/usenet-archive-galaxy-web/)) I ran into `pl.gazety.donosy`. It brought back memories of subscribing to Donosy, a daily newsletter with the main Polish and world news. These days I get something similar from [infopigula.pl](https://infopigula.pl). The first message in that group's archive is "Donosy #1705", dated 1995-11-19. That means 1704 issues came out before the group existed, and I wanted to know where they were...

## WHAT DONOSY WAS

*Donosy. Dziennik Liberalny* was a daily bulletin of domestic Polish news, written as a hobby by physicists at the University of Warsaw and founded by Ksawery Stojda. The first issue went out on 2 August 1989, which also made it into the [ICM timeline of Polish internet history](http://kalendarium.icm.edu.pl/). Donosy first travelled over BITNET and DECnet. Over the years it was also distributed through a mailing list and Usenet, it got an ISSN (0867-6860) in 1991, and it kept coming out until issue #6949 on 31 July 2025. More in the [Polish Wikipedia article](https://pl.wikipedia.org/wiki/Donosy._Dziennik_liberalny).

Issue #1 is a few lines of 1989 political humour: the First Secretary becomes President, the Premier becomes First Secretary, the Minister of Internal Affairs becomes Premier. It is signed "XS".

## WHERE THE ISSUES CAME FROM

No single place has all of them, so the archive is stitched together from four sources:
- #1 to #1704 (1989 to November 1995): the old Physics Department web archive at fuw.edu.pl
- #1705 to #5402 (November 1995 to August 2012): the `pl.gazety.donosy` group from usenet.nereid.pl, with the 203 issues that never reached Usenet filled in from fuw.edu.pl
- #5403 to #6191 (August 2012 to December 2017): the pipermail archive of the `donosy-l` mailing list
- #6192 to #6949 (2018 to July 2025): whatever survives from donosy.info, recovered from the Wayback Machine and a few archive.today snapshots

The mailing list years are plain ASCII with no Polish diacritics, which is how the originals were sent. A few issues looked like duplicates and turned out to be typos in the issue number. The odd ones out are #6122 and #6123, which each went out twice. Since the dates fit, I saved the second pair as #6124 and #6125.

## THE GAP AFTER 2017

In 2018 Donosy moved to its own site, donosy.info, after being "politely" asked to leave the network of the Faculty of Physics at the University of Warsaw (FUW). When the site disappeared it left no public archive. Its DNS no longer resolves, and the Wayback Machine only crawled the page with the current issue, so just 122 of the 758 issues from 2018 to 2025 could be recovered. The other 636 are still missing.

In total I have 6313 of 6949 numbered issues, 91 percent, plus three special issues. Everything from 1989 to 2017 is complete.

## THE VIEWER

To read the archive I put together a static viewer: a grid of years with recovered and missing counts, a page per issue, a page for numbering variants and full-text search that runs in the browser over a prebuilt index, with Polish diacritics handled. It runs locally from any static web server.

<div class="project-shots">
<picture><source srcset="/images/tidbits/donosy/year-grid.webp" type="image/webp"><img src="/images/tidbits/donosy/year-grid.png" alt="Donosy archive viewer with a grid of years and recovered issue counts" loading="lazy"></picture>
<picture><source srcset="/images/tidbits/donosy/first-issue.webp" type="image/webp"><img src="/images/tidbits/donosy/first-issue.png" alt="Donosy issue number 1 from 2 August 1989 in the viewer" loading="lazy"></picture>
</div>

The year grid and issue #1. Click to enlarge.

## NOT PUBLIC, YET

The archive isn't public because of copyright. I plan to contact Jerzy Michał Pawlak, one of the original editors, to ask about the missing issues from 2018 onwards, and about whether there is a good way to honour Donosy and make the archive public.

It is dedicated to everyone who wrote Donosy, and to Helena "Lena" Białkowska in particular. She was editor-in-chief from 1994 and a physics professor at the National Centre for Nuclear Research, and she died on 26 December 2025, a few months after the last issue. ([NCBJ notice](https://www.ncbj.gov.pl/en/late-prof-helena-bialkowska-passed-away))
