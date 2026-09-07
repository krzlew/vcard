---
layout: layouts/project.njk
pageNumber: P307
extensionText: "307: BOOKSHELF"
permalink: /projects/bookshelf/
title: BOOKSHELF
number: 307
tech: React / Vite / Hono / pnpm workspaces
status: ACTIVE
summary: A book inventory — scan ISBNs, track what you own
link: https://books.htsh.pl
linkLabel: books.htsh.pl
---
Scan a book's ISBN and it goes into an inventory, no reading
progress or star ratings involved. It exists purely to answer "do I
already own this book?" and "where did I put it?"

## OVERVIEW

Scan a book's ISBN barcode (or paste it, or bulk-import a CSV) and
it's added to the collection, enriched with Polish-language metadata
pulled from lubimyczytac, Goodreads, and Google Books, with Open
Library as a fallback.

## STACK

A pnpm monorepo: a Hono API, a React + Vite web dashboard, shared
ISBN-handling and type packages, with an iOS app planned. Deployed
to a small VPS behind Traefik.
