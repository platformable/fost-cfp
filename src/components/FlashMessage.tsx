'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Flash } from '@/lib/session';

// Shows a one-off message set by a server action, then clears the cookie that carried it.
export function FlashMessage({ flash }: { flash: Flash | null }) {
  const [shown, setShown] = useState<Flash | null>(flash);
  const path = usePathname();
  const shownAt = useRef(path);

  useEffect(() => {
    if (!flash) return;
    setShown(flash);
    shownAt.current = path;
    document.cookie = 'fost_flash=; Max-Age=0; path=/; SameSite=Lax';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.id]);

  useEffect(() => {
    if (path !== shownAt.current) setShown(null);
  }, [path]);

  if (!shown) return null;
  return <div className={`flash flash-${shown.type}`} role="status">{shown.message}</div>;
}
