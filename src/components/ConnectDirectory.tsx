import { useRef, useState } from 'react';
import type { ConnectDetails } from '../lib/connectDirectory';

type DirectoryState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'loaded'; connects: ConnectDetails[] };

export default function ConnectDirectory() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<DirectoryState>({ status: 'idle' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  async function loadConnects() {
    setState({ status: 'loading' });
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, '')}/connect-directory.json`,
      );
      if (!response.ok) throw new Error('Connect directory request failed.');
      const connects = (await response.json()) as ConnectDetails[];
      const fields = [
        'name',
        'suburb',
        'state',
        'postcode',
        'schedule',
      ] as const;
      if (
        !Array.isArray(connects) ||
        connects.some(
          (connect) =>
            !connect ||
            fields.some((field) => typeof connect[field] !== 'string') ||
            !Array.isArray(connect.demographics) ||
            connect.demographics.some((label) => typeof label !== 'string'),
        )
      )
        throw new Error('Invalid connect directory.');
      setState({ status: 'loaded', connects });
    } catch {
      setState({ status: 'error' });
    }
  }

  function openDirectory() {
    dialog.current?.showModal();
    setOpen(true);
    if (state.status === 'idle') void loadConnects();
  }

  const search = query.trim().toLowerCase();
  const visibleConnects =
    state.status === 'loaded'
      ? state.connects.filter((connect) =>
          [
            connect.name,
            connect.suburb,
            connect.state,
            connect.postcode,
            ...connect.demographics,
            connect.schedule,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search),
        )
      : [];

  return (
    <>
      <button
        type="button"
        className="directory-button"
        aria-haspopup="dialog"
        aria-controls="connect-directory"
        aria-expanded={open}
        onClick={openDirectory}
      >
        All connects
      </button>
      <dialog
        ref={dialog}
        id="connect-directory"
        className="directory-dialog"
        aria-labelledby="connect-directory-title"
        onClose={() => setOpen(false)}
      >
        <header className="directory-header">
          <h2 id="connect-directory-title">All connects</h2>
          <button
            type="button"
            className="directory-close"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </header>
        {state.status === 'loading' && (
          <p className="directory-message" role="status">
            Loading connects…
          </p>
        )}
        {state.status === 'error' && (
          <div className="directory-message">
            <p role="alert">Connect list unavailable.</p>
            <button
              type="button"
              className="directory-button"
              onClick={() => void loadConnects()}
            >
              Retry
            </button>
          </div>
        )}
        {state.status === 'loaded' && (
          <>
            <div className="directory-search">
              <label htmlFor="connect-search">Search connects</label>
              <input
                id="connect-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, suburb, demographics…"
              />
              <p role="status">
                {search
                  ? `${visibleConnects.length} of ${state.connects.length} connects`
                  : `${state.connects.length} connects`}
              </p>
            </div>
            <div
              className="directory-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Connect details table"
            >
              <table className="directory-table">
                <caption className="visually-hidden">
                  All connect details, excluding exact addresses
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Suburb</th>
                    <th scope="col">State</th>
                    <th scope="col">Postcode</th>
                    <th scope="col">Demographics</th>
                    <th scope="col">Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConnects.map((connect, index) => (
                    <tr key={index}>
                      <th scope="row">{connect.name}</th>
                      <td>{connect.suburb || '—'}</td>
                      <td>{connect.state || '—'}</td>
                      <td>{connect.postcode || '—'}</td>
                      <td>{connect.demographics.join(', ') || '—'}</td>
                      <td>{connect.schedule || '—'}</td>
                    </tr>
                  ))}
                  {!visibleConnects.length && (
                    <tr>
                      <td colSpan={6}>No connects match your search.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
