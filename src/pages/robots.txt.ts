import type { APIRoute } from 'astro';
import { SITE, SITE_URL } from '../config/site';

/** Advisory only (crawlers read robots.txt at the host root); the admin's noindex meta is the effective guard. */
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nDisallow: ${SITE.base}/admin/\nSitemap: ${SITE_URL}/sitemap-index.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
