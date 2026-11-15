---
layout: layouts/project.njk
pageNumber: P308
extensionText: "308: PORANNIK"
permalink: /projects/porannik/
title: PORANNIK
number: 308
tech: TypeScript / Vercel / Open-Meteo
status: ACTIVE
summary: A one-screen morning briefing - weather, sun and moon, name days, holidays and headlines for the day
link: https://porannik.vercel.app/
linkLabel: porannik.vercel.app
images:
  - /images/projects/porannik/index-view.jpg
---
Inspired by phone home screens that show the day's information at a glance, Porannik is a single page that answers "what is today?" in the morning: the date, the weather, who has a name day, what holiday it is and what the news says. The interface is in Polish.

## OVERVIEW

The page opens on the date, the weekday and a one-line morning brief with the weather and whether it is a day off, plus a bar showing how much of the year has passed and how many working and free days are left. Below are cards for the weather with an hourly trend, the sun with day length, sunrise and sunset, and the moon with its phase and the whole lunar cycle. The rest covers the top Polish and world headlines, a calendar of holidays and anniversaries with the next important dates, a "did you know" fact from Wikipedia, and upcoming solstices and equinoxes.

Everything is merged into one JSON summary for one day and one place, so the same data can later go out by email or a bot. Personal dates from calendars stay out of the public response and are only returned with a token.

## STACK

TypeScript, with the data built on the server and the page served as plain HTML from Vercel, where a scheduled job produces the daily summary. Weather and city search come from Open-Meteo. Sun and moon are calculated offline, and holidays and the days-off maths come from an offline holiday library. Holiday names and name days come from public Polish web sources, the headlines from a news feed, and the anniversaries and the daily fact from Polish Wikipedia. A source that fails only empties its own card.
