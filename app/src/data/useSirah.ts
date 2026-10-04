import { useEffect, useState } from 'react';
import { getSirah } from './load';
import type { Sirah } from './types';

export type SirahState = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: Sirah };

export function useSirah(): SirahState {
  const [state, setState] = useState<SirahState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    getSirah().then(
      data => { if (live) setState({ status: 'ready', data }); },
      error => { if (live) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}
