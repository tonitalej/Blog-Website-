function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHtml(value) {
  const withoutTags = String(value).replace(
    /<(?!\/?(p|br|h2|h3|ul|ol|li|strong|em|blockquote|a)\b)[^>]*>/gi,
    "",
  );
  return withoutTags
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');
}

function slugify(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "post";
}

function formatDate(value) {
  const date = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function uniqueSlug(db, title, ignoreId) {
  const base = slugify(title);
  let slug = base;
  let count = 2;
  while (db.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").get(slug, ignoreId || 0)) {
    slug = `${base}-${count}`;
    count += 1;
  }
  return slug;
}

module.exports = { escapeHtml, sanitizeHtml, slugify, formatDate, uniqueSlug };
