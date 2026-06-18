// Voice diagnostics: log to the browser console AND ship to the server so we
// can watch the (otherwise invisible) browser↔Google voice session in the
// server logs. Batches lines to avoid hammering the endpoint.
let _buffer: string[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  _timer = null;
  if (_buffer.length === 0) return;
  const events = _buffer;
  _buffer = [];
  // Fire-and-forget; never block the audio path on logging.
  fetch('/api/voice/debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

export function vlog(msg: string, ...rest: unknown[]) {
  const line = rest.length
    ? `${msg} ${rest.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join(' ')}`
    : msg;
  // eslint-disable-next-line no-console
  console.log('[voice]', line);
  const t = new Date().toISOString().slice(11, 23);
  _buffer.push(`${t} ${line}`);
  if (_buffer.length >= 20) {
    if (_timer) { clearTimeout(_timer); }
    flush();
  } else if (!_timer) {
    _timer = setTimeout(flush, 800);
  }
}
