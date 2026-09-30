---
layout: layouts/post.njk
pageNumber: P205
extensionText: "205: INDIEWEB AND WEB STANDARDS"
title: "Aligning a personal site with IndieWeb and web standards"
number: 205
date: 2026-09-30
tags: [INDIEWEB, MICROFORMATS, WEBMENTION]
summary: Adding IndieWeb microformats2 and Webmention support to htsh.pl - and where the line is between "worth doing" and "checklist theater"
permalink: /blog/web-standards-audit/
---
## RECLAIMING THE DOMAIN

I recently decided it was finally time to kill the "coming soon"-like placeholder on my main domain, htsh.pl. The initial plan was simple: throw up a minimalist personal/semi-business vCard and call it a day.

But scope creep set in. That simple vCard evolved into a full-fledged hub featuring a blog, project showcases, and a repository for technical tidbits and research notes - all wrapped in a dark-mode, teletext-inspired aesthetic.

Building a site from scratch in 2026, it's easy to assume you already know how the internet works: buy a domain, provision hosting, write some markup. But building something meant to last and interoperate with the broader web means revisiting the actual standards. If you're starting this journey, the [IndieWeb Getting Started guide](https://indieweb.org/Getting_Started) is the perfect launchpad.

Here's what I ended up auditing and adding to htsh.pl - from the boring web basics to the IndieWeb-specific pieces.

## WHO ACTUALLY SETS THE STANDARDS

Before diving into code, it helps to know who's driving the underlying rules of the web. A few key organizations do most of the heavy lifting:

- **[WHATWG (Web Hypertext Application Technology Working Group)](https://whatwg.org/)** - founded in 2004 by Apple, Mozilla, and Opera, and maintains the HTML Living Standard and DOM specifications.
- **[W3C (World Wide Web Consortium)](https://www.w3.org/)** - the primary international standards body handling CSS, accessibility guidelines, and the Webmention spec used below.
- **[IETF (Internet Engineering Task Force)](https://www.ietf.org/)** - standardizes the protocol layer underneath all of this: HTTP itself (RFC 9110) and, more relevant here, `robots.txt` (RFC 9309).
- **[ECMA International](https://www.ecma-international.org/)** - standardizes JavaScript (ECMAScript) and related runtime specs.

## THE BORING BASELINE

Before adding any IndieWeb-specific markup, I went through the less exciting parts of the site first. Most of them don't need a framework or another service - they just need to be done properly.

- **Semantic HTML and accessibility** - pages use proper landmarks and native elements (`<article>`, `<nav>`, `<main>`) where possible instead of rebuilding browser behaviour from `<div>`s. On this site, CSS is what turns that plain HTML into the retro ModeSeven-powered teletext interface you're reading right now. Semantic markup gives screen readers and keyboard users a decent baseline for free, but it doesn't remove the need to check focus order, contrast, alt text, and keyboard navigation separately, or the need to build against a real standard: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) today, not [WCAG 3.0](https://www.w3.org/TR/wcag-3.0/), which would overhaul how accessibility is measured but is still a Working Draft as of its September 10, 2026 update.
- **Responsive layout** - the teletext aesthetic is intentionally rigid-looking, but the layout itself still has to survive narrow screens without horizontal scrolling or unusable navigation.
- **Security headers** - HSTS, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` were already present. CSP was the missing piece, so I added it at the same layer that manages the rest of the response headers rather than treating it as a separate feature.
- **Privacy signals** - the site doesn't collect much in the first place, but it still makes sense to respect browser-level signals such as [Global Privacy Control](https://www.w3.org/TR/gpc/). GPC is still a W3C Working Draft (last updated September 24, 2026), but browser support is already widespread enough that ignoring it would be a strange default.
- **Crawler policy** - `robots.txt` is no longer only about search-engine indexing. In 2026 it also carries vendor-specific controls for AI use. Some names, such as `GPTBot`, `ClaudeBot`, and `CCBot`, are actual crawlers. Others, including `Google-Extended` and `Applebot-Extended`, are policy tokens controlling how content collected by the corresponding crawlers may be used.

My policy is intentionally permissive. I don't mind the site being indexed or used by AI systems, so I explicitly allow the relevant agents and tokens instead of leaving that policy implicit behind `User-agent: *`.

None of this is particularly interesting technology. That's probably the point: the boring baseline should already be in place before adding another layer of metadata and protocols on top.

## JOINING THE INDIEWEB: MICROFORMATS VS JSON-LD

This is where standard web design turns into being a good citizen of the open web. Instead of relying solely on platform algorithms, IndieWeb is about owning your data on your own domain first.

To get there, htsh.pl runs a dual-strategy: [microformats2](https://microformats.org/) for IndieWeb tooling, and Schema.org JSON-LD for search engines. They overlap in purpose but serve different readers, and both coexist fine on the same page.

### Microformats2: h-card and h-entry

Microformats are just HTML class names - `h-card`, `h-entry`, `p-name`, `u-url` - that make existing markup machine-readable, no API or schema registry required. On htsh.pl:

- The homepage identity block is wrapped in `h-card`, with `p-name` on my name, `u-photo` on my avatar, and `u-url` marking the canonical link back to the domain.
- Every blog post and tidbit is wrapped in `h-entry`, with `p-name` on the title, `dt-published` on the publish date (in ISO8601 with a timezone), `e-content` around the body, and `p-category` for each tag.
- Each entry also carries a `p-author h-card` pointing back at my name and homepage - it's `hidden`, since the page already displays my identity visibly elsewhere, but parsers read the DOM regardless of CSS visibility. The same link also carries `rel="author"` as a compatibility hint for older tooling, even though current IndieWeb practice treats it as legacy - `p-author` inside the `h-entry` is the modern way to expose authorship, and this site already has that covered.

### rel=me: linking the identity together

The `h-card` describes who the page belongs to, but it doesn't by itself connect that identity to profiles elsewhere. That's where `rel="me"` comes in: it says that another URL represents the same person.

On htsh.pl, the GitHub and LinkedIn links carry it directly:

```html
<a href="https://github.com/krzlew" rel="me">GitHub</a>
<a href="https://www.linkedin.com/in/krzysztof-lewczuk/" rel="me">LinkedIn</a>
```

The useful part is the backlink. My GitHub profile's Website field points back to `htsh.pl`, creating a reciprocal relationship between the two URLs - that's what makes `rel="me"` checkable by other tools, not just declarative.

### Schema.org / JSON-LD

Microformats2 covers the IndieWeb side of the site. For search-engine structured data, every post also includes a Schema.org `application/ld+json` script block, which is what [Google recommends for most structured-data implementations](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), so crawlers know exactly who wrote the article and when it was published. Both markup styles read the same underlying facts - they just target different audiences, and neither one replaces the other.

### POSSE and social cards

I already follow the basic **POSSE** idea - Publish (on your) Own Site, Syndicate Elsewhere - although the syndication part is manual.

Posts are published on htsh.pl first, and some of them are then adapted and posted to LinkedIn. There is no automation or publishing API involved; I just treat my own site as the canonical copy and LinkedIn as the distribution channel.

What I haven't added yet is `u-syndication`. For posts that have a corresponding LinkedIn copy, I could point it at that post's permalink and make the relationship explicit in the markup. For everything else there is nothing to advertise, so adding empty or invented syndication links would just be checklist theater.

Separately, the site publishes Open Graph (`og:image`, `og:title`) and Twitter Card metadata using the pixel avatar. That's unrelated to POSSE itself - it controls how links render when someone shares them in places such as Discord, LinkedIn or Mastodon.

To support following the site without a platform in the loop at all, it also serves standard **RSS and Atom feeds** (`/feed.xml` and `/atom.xml`). All roads lead back to the domain.

## VALIDATION, WEBMENTIONS, AND COMMENTS

Before calling this done, test it against the checklists the IndieWeb community built for exactly this purpose:

- **[IndieWebify.me](https://indiewebify.me/)** - validates h-card, rel-me, h-entry, and Webmention support step by step.
- **[Specification.website](https://specification.website/about/)** - a broader all-in-one checklist for general web standards compliance.

### The social layer

I ended up with two separate interaction paths:

**[Webmention](https://www.w3.org/TR/webmention/)** is a decentralized link-notification protocol that can carry replies, mentions and other cross-site interactions. Two lines in `<head>` point at a receiving endpoint:

```html
<link rel="webmention" href="https://webmention.io/htsh.pl/webmention">
<link rel="pingback" href="https://webmention.io/htsh.pl/xmlrpc">
```

The endpoint itself is hosted by **[webmention.io](https://webmention.io/)** - free, and it doesn't do anything until the domain is claimed there via IndieAuth. Claiming works via a RelMeAuth-style check: IndieAuth confirms a domain and an external profile belong to the same person by looking for exactly the reciprocal `rel="me"` backlink set up earlier, on GitHub in my case. Webmention itself has no identity requirement at all, though - at the protocol level, a source just tells a target that it links there, and the target fetches the source URL to confirm the link actually exists. `rel="me"` only matters for this claiming step, not for the act of sending or receiving a Webmention. Once claimed, when someone links to a post here from a Webmention-aware site, their server notifies the webmention.io endpoint advertised by my page, and the mention shows up in a feed I can check.

I deliberately skipped webmention.io's webhook option, which pushes new mentions to a callback URL instead of me polling the feed - that needs a server to receive the POST, and this is a static Eleventy site with no backend. Standing up a serverless function just to avoid checking an Atom feed occasionally isn't worth the infrastructure for the mention volume a small personal site actually gets.

**[Giscus](https://giscus.app/)** covers traditional, human-readable comments right on the page, backed by GitHub Discussions. Webmention and Giscus aren't competing with each other here; Giscus is for readers who want to leave a comment directly, Webmention is for readers who wrote their own response elsewhere and want this site to know about it.

## POST-LAUNCH MONITORING

Once the site is live, you need to tell the web it exists:

- Add the site to [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) to monitor indexing and organic performance.
- Implement **[IndexNow](https://www.indexnow.org/documentation)** - instead of waiting for crawlers to find new posts, the server notifies participating search engines the moment a page is published or updated. Current participants include Bing, Amazon, Naver, Seznam, Yandex, and Yep; Google isn't among them.

## WHERE I STOPPED

The useful cutoff turned out to be fairly simple: anything that improves interoperability for almost no runtime cost stays. Semantic markup, microformats, feeds, `rel="me"`, structured data and Webmention discovery all fall into that category.

The line moves once another service, credential, deployment target or backend is involved. Syndication happens manually to LinkedIn today, so there is no `u-syndication` markup yet - adding it once that copy's permalink actually exists is cheap, but automating the syndication itself is not, so it stays manual. Webmention volume doesn't justify a webhook receiver, so I poll the feed. There is no point adding infrastructure just to tick another IndieWeb box.

That is probably the part of this rebuild I want to keep: use the standards where they solve an actual problem, and stop when implementing the next one becomes checklist theater.
