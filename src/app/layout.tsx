import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { logoutAction } from '@/actions/auth';
import { FlashMessage } from '@/components/FlashMessage';
import { NavLink } from '@/components/NavLink';
import { currentUser, readFlash } from '@/lib/session';

export const metadata: Metadata = {
  title: { default: 'FOST Call for Speakers', template: '%s · FOST Call for Speakers' },
  description: 'Submit a proposal to speak at FOST conferences.',
  icons: { icon: '/img/favicon.png', apple: '/img/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#020616' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, flash] = await Promise.all([currentUser(), readFlash()]);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" />
      </head>
      <body>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link className="brand" href="/" aria-label="FOST Call for Speakers, home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-logo" src="/img/fost-wordmark.png" alt="FOST" width={110} height={32} />
              <span className="brand-sub">Call for speakers</span>
            </Link>
            <nav>
              <NavLink href="/" exact>Open calls</NavLink>
              {user ? (
                <>
                  <NavLink href="/proposals">My proposals</NavLink>
                  {(user.role === 'reviewer' || user.role === 'admin') && <NavLink href="/review">Review</NavLink>}
                  {user.role === 'admin' && <NavLink href="/admin">Organise</NavLink>}
                  <NavLink href="/profile">{user.first_name}</NavLink>
                  <form action={logoutAction} className="inline"><button className="nav-button">Sign out</button></form>
                </>
              ) : (
                <>
                  <NavLink href="/login">Sign in</NavLink>
                  <Link href="/register" className="btn btn-small">Create account</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="wrap">
          <FlashMessage flash={flash} />
          {children}
        </main>
        <footer className="footer">
          <div className="wrap footer-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="footer-logo" src="/img/fost-wordmark.png" alt="FOST" width={76} height={22} />
            <span className="tagline">Future of Software Technologies</span>
            <span>Call for speakers and program committee review</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
