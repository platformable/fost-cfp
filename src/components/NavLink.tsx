'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return <Link href={href} className={active ? 'active' : ''}>{children}</Link>;
}
