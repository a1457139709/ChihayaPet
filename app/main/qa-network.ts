// Used only when an explicitly isolated QA launch requests synthetic network traffic.
// No fixtures, requests, or conversation logs are part of normal application startup.
export const qaFetch: typeof fetch = async (_url, options) => {
  const body = JSON.parse(String(options?.body));
  const text = '这是一段用于运行验证的虚构回复。请稍作休息，照顾好自己。'.repeat(100);
  if (!body.stream) return new Response(JSON.stringify({ choices: [{ message: { content: '连接成功' }, finish_reason: 'stop' }] }));
  let offset = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const tick = () => {
        if (options?.signal?.aborted) { controller.error(new Error('Cancelled')); return; }
        const content = text.slice(offset, offset + 60); offset += 60;
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content }, ...(offset >= text.length ? { finish_reason: 'stop' } : {}) }] }) + '\n\n'));
        if (offset >= text.length) controller.close(); else timer = setTimeout(tick, 100);
      }; tick();
    },
    cancel() { clearTimeout(timer); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
};
