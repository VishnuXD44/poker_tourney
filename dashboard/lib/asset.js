/** Prefixes a file in public/ with the base path; next/link does this for links but plain <img> does not. */
export const asset = (path) => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
