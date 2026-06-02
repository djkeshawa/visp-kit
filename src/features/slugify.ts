const defaultMaxSlugLength = 60;

export function slugifyFeatureTitle(
  title: string,
  maxLength = defaultMaxSlugLength
): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.slice(0, maxLength).replace(/-+$/g, "");
}
