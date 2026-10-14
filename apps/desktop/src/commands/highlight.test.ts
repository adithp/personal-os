import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

const marked = (text: string, query: string) =>
  highlight(text, query)
    .filter((part) => part.match)
    .map((part) => part.text);

describe('highlight', () => {
  it('marks the start of each word that begins with a typed word, ignoring case', () => {
    expect(marked('Pay rent to Mr. Nair', 'PA re')).toEqual(['Pa', 're']);
  });

  it('does not mark the middle of a word', () => {
    expect(marked('invoice 42', 'voice')).toEqual([]);
  });

  it('keeps the whole text in order', () => {
    const parts = highlight('Pay rent', 'pay');
    expect(parts.map((p) => p.text).join('')).toBe('Pay rent');
    expect(parts[0]).toEqual({ text: 'Pay', match: true });
  });

  it('treats punctuation as a word boundary on both sides', () => {
    expect(marked('Call (Nair), e-mail: invoice-42', 'nair mail invoice')).toEqual([
      'Nair',
      'mail',
      'invoice',
    ]);
    expect(marked('C++ notes', 'c++')).toEqual(['C']);
  });

  it('finds Malayalam words with their combining marks', () => {
    expect(marked('വാടക കൊടുക്കണം', 'വാട')).toEqual(['വാട']);
    expect(marked('വാടക കൊടുക്കണം', 'കൊടു')).toEqual(['കൊടു']);
  });

  it('marks nothing for a query with no words', () => {
    expect(highlight('Pay rent', ' ?! ')).toEqual([{ text: 'Pay rent', match: false }]);
  });
});
