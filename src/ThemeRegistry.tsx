'use client';

import * as React from 'react';
import { CacheProvider } from '@emotion/react';
import createEmotionServer from '@emotion/server/create-instance';
import { useServerInsertedHTML } from 'next/navigation';
import createEmotionCache from './createEmotionCache';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [cache] = React.useState(() => createEmotionCache());
  const { extractCriticalToChunks, constructStyleTagsFromChunks } = createEmotionServer(cache);

  useServerInsertedHTML(() => {
    const chunks = extractCriticalToChunks();
    return (
      <style
        data-emotion={`${cache.key} ${chunks.styles.map((style) => style.key).join(' ')}`}
        dangerouslySetInnerHTML={{ __html: constructStyleTagsFromChunks(chunks) }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}