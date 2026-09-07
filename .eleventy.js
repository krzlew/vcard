const pluginRss = require("@11ty/eleventy-plugin-rss").default;

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginRss);

  eleventyConfig.addPassthroughCopy("style.css");
  eleventyConfig.addPassthroughCopy("script.js");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("avatar-pixel.png");
  eleventyConfig.addPassthroughCopy("favicon.svg");
  eleventyConfig.addPassthroughCopy("cv");

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/blog/*.md").sort((a, b) => a.data.number - b.data.number)
  );

  eleventyConfig.addCollection("projects", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/projects/*.md").sort((a, b) => a.data.number - b.data.number)
  );

  eleventyConfig.addCollection("numbered", (collectionApi) => {
    const fromPages = collectionApi
      .getAll()
      .filter((item) => /^P?\d+$/i.test(item.data.pageNumber || ""))
      .map((item) => ({
        number: String(item.data.pageNumber).replace(/^P/i, ""),
        url: item.url,
      }));
    // cv/ is a passthrough-copied static folder, not an Eleventy template,
    // so it never shows up in collectionApi.getAll() - map its number by hand.
    return [...fromPages, { number: "110", url: "/cv/" }];
  });

  eleventyConfig.addFilter("jsonStringify", (obj) => JSON.stringify(obj));

  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));

  eleventyConfig.addFilter("stripP", (s) => String(s).replace(/^P/i, ""));

  eleventyConfig.addFilter("dateDisplay", (isoDate) => {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
  };
};
