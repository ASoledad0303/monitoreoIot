'use client';

import * as React from 'react';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import createEmotionCache from './createEmotionCache';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [cache] = React.useState(() => createEmotionCache());

  useServerInsertedHTML(() => {
    // Collect emotion styles from the cache and inject them on server
    const inserted = (cache as any).inserted as Record<string, string | boolean>;
    let css = '';
    Object.keys(inserted).forEach((key) => {
      const value = inserted[key];
      if (value !== true) {
        css += value as string;
      }
    });

    return (
      <style
        data-emotion={cache.key}
        dangerouslySetInnerHTML={{ __html: css }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}