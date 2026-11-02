/** Browser URL for a stored (data-dir relative) media path. Safe to use in server and client components. */
export const mediaUrl = (rel: string | null | undefined) => (rel ? `/api/media/${rel.split('/').map(encodeURIComponent).join('/')}` : '');
