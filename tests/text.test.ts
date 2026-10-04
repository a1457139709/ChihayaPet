import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSend, replyExcerpt } from '../app/shared/text.ts';

test('send is available only for a nonblank draft within 2000 graphemes and no active request', () => {
  assert.equal(canSend(' \n\t', false), false);
  assert.equal(canSend('你好', true), false);
  assert.equal(canSend('👩🏽‍💻'.repeat(2000), false), true);
  assert.equal(canSend('👩🏽‍💻'.repeat(2001), false), false);
});

test('reply excerpts add a visible ellipsis when measured text exceeds four lines, even below 60 graphemes', () => {
  // The layout boundary supplies its measured fit, including explicit line breaks.
  const fits = (text: string) => text.split('\n').length <= 4;
  assert.deepEqual(replyExcerpt('一\n二\n三\n四\n五', fits), { text: '一\n二\n三\n四…', needsReadMore: true });
  assert.deepEqual(replyExcerpt('短句', fits), { text: '短句', needsReadMore: false });
  assert.deepEqual(replyExcerpt('短句', fits, true), { text: '短句', needsReadMore: true });
  const long = replyExcerpt('👩🏽‍💻'.repeat(61), fits);
  assert.equal(long.text, '👩🏽‍💻'.repeat(59) + '…');
  assert.equal(long.needsReadMore, true);
});
