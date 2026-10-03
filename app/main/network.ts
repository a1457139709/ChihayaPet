import { connection } from './storage';
import { characterCount } from '../shared/text';
import type { Message, Reply } from '../shared/contracts';

export type Request = { baseURL: string; model: string; key: string; messages: Message[]; stream: boolean; signal?: AbortSignal; timeoutMS?: number; maximumBytes?: number };
type Choice = { index?: number; delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: string };
const invalid = () => new Error('服务未返回可用的文本回复，请检查接口兼容性。');
const tooLarge = () => new Error('回复超过本地允许的大小。');
export async function requestReply(request: Request, onDelta: (delta: string) => void = () => {}, fetcher: typeof fetch = fetch): Promise<Reply> {
  const config = connection(request.baseURL, request.model);
  if (!request.key.trim()) throw new Error('请填写 API Key。');
  const controller = new AbortController();
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMS ?? 60_000);
  const signal = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal;
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(new Error(timedOut ? '请求超时，请稍后手动重试。' : '请求已取消。'));
    if (signal.aborted) abortListener(); else signal.addEventListener('abort', abortListener, { once: true });
  });
  const race = <T>(work: Promise<T>) => Promise.race([work, aborted]);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await race(fetcher(config.baseURL + '/chat/completions', {
      method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${request.key.trim()}` },
      body: JSON.stringify({ model: config.model, messages: request.messages, stream: request.stream }),
    }));
    if (response.status >= 300 && response.status < 400) throw new Error('服务返回了重定向，请填写重定向后的最终 HTTPS 地址。');
    if ([401, 403].includes(response.status)) throw new Error('鉴权失败，请检查 API Key、账户权限或账户状态。');
    if (response.status === 429) throw new Error('额度或请求频率受限，请稍后手动重试。');
    if (response.status >= 500) throw new Error('模型服务暂时不可用，请稍后重试。');
    if (!response.ok) throw new Error('请求端点不可用，请检查基础地址和模型名称。');
    const maximum = request.maximumBytes ?? 2_000_000;
    if (Number(response.headers.get('content-length')) > maximum) throw tooLarge();
    if (!response.body) throw invalid();
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, raw = '', buffer = '', text = '', sawData = false, terminal = false, truncated = false;
    let data: string[] = [];
    const append = (delta: string) => {
      if (characterCount(text + delta) > 20_000) throw tooLarge();
      text += delta; if (delta) onDelta(delta);
    };
    const event = () => {
      if (!data.length || terminal) return;
      const payload = data.join('\n'); data = [];
      if (payload === '[DONE]') { terminal = true; return; }
      let value: { choices?: Choice[] };
      try { value = JSON.parse(payload); } catch { throw invalid(); }
      if (!Array.isArray(value.choices)) throw invalid();
      const choice = value.choices.find(c => c.index === 0);
      if (!choice) return; // Usage and other choices do not constitute reply text.
      const content = choice.delta?.content;
      if (content != null && typeof content !== 'string') throw invalid();
      if (typeof content === 'string') append(content);
      if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') { terminal = true; truncated = choice.finish_reason === 'length'; }
    };
    const line = (value: string) => {
      if (!value) event();
      else if (value === 'data' || value.startsWith('data:')) { sawData = true; data.push(value === 'data' ? '' : value.slice(5).replace(/^ /, '')); }
    };
    while (!terminal) {
      const next = await race(reader.read());
      if (next.done) break;
      bytes += next.value.byteLength; if (bytes > maximum) throw tooLarge();
      const chunk = decoder.decode(next.value, { stream: true }); raw += chunk;
      if (request.stream) {
        buffer += chunk;
        // Do not split a CRLF across incoming chunks into two blank lines.
        let match: RegExpExecArray | null;
        while ((match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
          line(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length);
          if (terminal) break;
        }
      }
    }
    const tail = decoder.decode(); raw += tail; buffer += tail;
    if (request.stream && sawData && !terminal) { if (buffer) line(buffer.replace(/\r$/, '')); event(); }
    if (!sawData) {
      let choice: Choice | undefined;
      try { choice = (JSON.parse(raw) as { choices: Choice[] }).choices[0]; } catch { throw invalid(); }
      if (typeof choice?.message?.content !== 'string') throw invalid();
      append(choice.message.content); truncated = choice.finish_reason === 'length'; terminal = true;
    }
    if (!terminal || !text.trim()) throw invalid();
    return { text, truncated };
  } catch (error) {
    if (signal.aborted) throw new Error(timedOut ? '请求超时，请稍后手动重试。' : '请求已取消。');
    if (error instanceof TypeError) throw new Error('连接失败，请检查网络、服务地址和 TLS 配置。');
    throw error;
  } finally {
    clearTimeout(deadline); if (abortListener) signal.removeEventListener('abort', abortListener);
    void reader?.cancel().catch(() => {});
    controller.abort();
  }
}
