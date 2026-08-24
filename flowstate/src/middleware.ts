import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
  const userId = request.cookies.get('fs_userid')?.value;
  const { pathname } = request.nextUrl;

  // Paths that do not require authentication
  const isPublicPath = pathname === '/login';

  // Allow next.js internal assets, static files, and api routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.match(/\.(.*)$/)
  ) {
    return NextResponse.next();
  }

  if (!userId && !isPublicPath) {
    // Redirect unauthenticated users to the login page
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (userId && isPublicPath) {
    // Redirect authenticated users away from the login page
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
