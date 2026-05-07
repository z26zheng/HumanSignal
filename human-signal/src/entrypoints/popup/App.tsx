import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { sendToBackground } from '@/shared/messaging';

type ConnectionStatus = 'checking' | 'connected' | 'unavailable';

export function App(): JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');

  useEffect((): (() => void) => {
    let isMounted: boolean = true;

    void sendToBackground({
      type: 'PING',
      source: 'popup',
    }).then((response): void => {
      if (!isMounted) {
        return;
      }

      setConnectionStatus(response.ok ? 'connected' : 'unavailable');
    });

    return (): void => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="human-signal-popup">
      <section className="hero">
        <p className="eyebrow">HumanSignal</p>
        <h1>LinkedIn signal intelligence</h1>
        <p className="description">
          The extension shell is ready. Detection, scoring, and overlays will attach to this
          foundation in the next execution phases.
        </p>
      </section>

      <section className="status-card" aria-label="Extension status">
        <span className={`status-dot status-dot--${connectionStatus}`} aria-hidden="true" />
        <div>
          <p className="status-label">Background service worker</p>
          <p className="status-value">{formatConnectionStatus(connectionStatus)}</p>
        </div>
      </section>
    </main>
  );
}

function formatConnectionStatus(status: ConnectionStatus): string {
  switch (status) {
    case 'checking':
      return 'Checking...';
    case 'connected':
      return 'Connected';
    case 'unavailable':
      return 'Unavailable';
  }
}
