import { describe, expect, it } from 'vitest';
import { partKey, parseQuickAdd } from './parse';

// Tuesday 7 October 2025, 18:00 in India (12:30 UTC)
const NOW = new Date('2025-10-07T12:30:00.000Z');
const parse = (input: string, now = NOW, ignored: string[] = []) =>
  parseQuickAdd(input, now, new Set(ignored));

describe('tags', () => {
  it('reads #words at the start or after a space, in typed order, without repeats', () => {
    const result = parse('#Home buy milk #work #home');
    expect(result.tagNames).toEqual(['Home', 'work']);
    expect(result.title).toBe('buy milk');
  });

  it('leaves trailing punctuation out of the name and in the title', () => {
    const result = parse('call #mum, now');
    expect(result.tagNames).toEqual(['mum']);
    expect(result.title).toBe('call , now');
  });

  it('does not read C#, a link, a lone #, a name with another #, or a name over 40 characters', () => {
    expect(parse('learn C# today?').tagNames).toEqual([]);
    expect(parse('see https://x.com/#top').tagNames).toEqual([]);
    expect(parse('# alone').tagNames).toEqual([]);
    expect(parse('#a#b').tagNames).toEqual([]);
    expect(parse(`#${'a'.repeat(41)}`).tagNames).toEqual([]);
    expect(parse(`#${'a'.repeat(40)}`).tagNames).toHaveLength(1);
    expect(parse('see https://x.com/#top').title).toBe('see https://x.com/#top');
  });

  it('labels the chip with the name only', () => {
    expect(parse('x #home').parts[0]).toMatchObject({ kind: 'tag', text: '#home', label: 'home' });
  });
});

describe('priority', () => {
  it('reads numbers and words, ignoring capitals', () => {
    expect(parse('a !1').priority).toBe(1);
    expect(parse('a !4').priority).toBe(4);
    expect(parse('a !URGENT').priority).toBe(1);
    expect(parse('a !high').priority).toBe(2);
    expect(parse('a !Medium').priority).toBe(3);
    expect(parse('a !low').priority).toBe(4);
  });

  it('labels the chip', () => {
    expect(parse('a !1').parts[0]?.label).toBe('Urgent');
    expect(parse('a !high').parts[0]?.label).toBe('High');
    expect(parse('a !3').parts[0]?.label).toBe('Medium');
    expect(parse('a !low').parts[0]?.label).toBe('Low');
  });

  it('counts only the first one; the second stays in the title', () => {
    const result = parse('!1 fix !3');
    expect(result.priority).toBe(1);
    expect(result.title).toBe('fix !3');
    expect(result.parts).toHaveLength(1);
  });

  it('needs a whole word after a space or the start', () => {
    for (const input of ['wow!high', '!5', '!highest', 'a !high!']) {
      expect(parse(input).priority).toBeNull();
    }
  });
});

describe('dates and times', () => {
  it.each([
    ['tomorrow 5pm', '2025-10-08T11:30:00.000Z', false, 'Tomorrow, 5:00 PM'],
    ['5pm', '2025-10-08T11:30:00.000Z', false, 'Tomorrow, 5:00 PM'],
    ['at 9:30', '2025-10-08T04:00:00.000Z', false, 'Tomorrow, 9:30 AM'],
    ['today', '2025-10-06T18:30:00.000Z', true, 'Today'],
    ['tomorrow', '2025-10-07T18:30:00.000Z', true, 'Tomorrow'],
    ['friday', '2025-10-09T18:30:00.000Z', true, 'Fri, 10 Oct'],
    ['next friday', '2025-10-16T18:30:00.000Z', true, 'Fri, 17 Oct'],
    ['in 3 days', '2025-10-09T18:30:00.000Z', true, 'Fri, 10 Oct'],
    ['oct 12', '2025-10-11T18:30:00.000Z', true, 'Sun, 12 Oct'],
    ['12 oct', '2025-10-11T18:30:00.000Z', true, 'Sun, 12 Oct'],
    ['5/11', '2025-11-04T18:30:00.000Z', true, 'Wed, 5 Nov'],
  ])('reads "%s"', (text, dueAt, allDay, label) => {
    const result = parse(`Pay ${text}`);
    expect(result).toMatchObject({ title: 'Pay', dueAt, dueAllDay: allDay });
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({ kind: 'date', label });
  });

  it('reads 5pm typed at 6pm as tomorrow and typed at 10am as today', () => {
    expect(parse('call 5pm').dueAt).toBe('2025-10-08T11:30:00.000Z');
    expect(parse('call 5pm', new Date('2025-10-07T04:30:00.000Z')).dueAt).toBe(
      '2025-10-07T11:30:00.000Z',
    );
  });

  it('counts only the first date; other date words stay in the title', () => {
    const result = parse('flight friday back sunday');
    expect(result.dueAt).toBe('2025-10-09T18:30:00.000Z');
    expect(result.title).toBe('flight back sunday');
  });

  it('does not read single ambiguous words or plain text', () => {
    for (const input of [
      'May',
      'march madness',
      'sat',
      'sun',
      'second',
      'now',
      'a',
      'hello world',
    ]) {
      const result = parse(input);
      expect(result.dueAt).toBeNull();
      expect(result.title).toBe(input);
    }
  });

  it('still reads a month with a day, and a year in range only', () => {
    expect(parse('party may 20').parts[0]?.kind).toBe('date');
    expect(parse('old 1 jan 1999').dueAt).toBeNull();
    expect(parse('far 12 oct 2150').dueAt).toBeNull();
  });

  it('is India time at 00:10 on the 1st (still the day before in UTC)', () => {
    const now = new Date('2025-10-31T18:40:00.000Z'); // 1 Nov 2025, 00:10 IST
    expect(parse('x today', now).dueAt).toBe('2025-10-31T18:30:00.000Z');
    expect(parse('x tomorrow', now).dueAt).toBe('2025-11-01T18:30:00.000Z');
    expect(parse('x today', now).parts[0]?.label).toBe('Today');
  });

  it('crosses a month end and a leap day', () => {
    const monthEnd = new Date('2025-01-31T06:30:00.000Z');
    expect(parse('x tomorrow', monthEnd).dueAt).toBe('2025-01-31T18:30:00.000Z'); // 1 Feb
    const leap = new Date('2028-02-28T06:30:00.000Z');
    expect(parse('x tomorrow', leap).dueAt).toBe('2028-02-28T18:30:00.000Z'); // 29 Feb
    expect(parse('x in 2 days', leap).dueAt).toBe('2028-02-29T18:30:00.000Z'); // 1 Mar
  });
});

describe('repeat', () => {
  it.each([
    ['every day', 'FREQ=DAILY', '2025-10-06T18:30:00.000Z', 'Every day'],
    ['daily', 'FREQ=DAILY', '2025-10-06T18:30:00.000Z', 'Every day'],
    ['every week', 'FREQ=WEEKLY;BYDAY=TU', '2025-10-06T18:30:00.000Z', 'Every week on Tue'],
    ['weekly', 'FREQ=WEEKLY;BYDAY=TU', '2025-10-06T18:30:00.000Z', 'Every week on Tue'],
    ['every monday', 'FREQ=WEEKLY;BYDAY=MO', '2025-10-12T18:30:00.000Z', 'Every week on Mon'],
    ['every Thu', 'FREQ=WEEKLY;BYDAY=TH', '2025-10-08T18:30:00.000Z', 'Every week on Thu'],
    [
      'every monday and thursday',
      'FREQ=WEEKLY;BYDAY=MO,TH',
      '2025-10-08T18:30:00.000Z',
      'Every week on Mon, Thu',
    ],
    [
      'every mon, wed',
      'FREQ=WEEKLY;BYDAY=MO,WE',
      '2025-10-07T18:30:00.000Z',
      'Every week on Mon, Wed',
    ],
    [
      'every weekday',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      '2025-10-06T18:30:00.000Z',
      'Every week on Mon, Tue, Wed, Thu, Fri',
    ],
    [
      'every month',
      'FREQ=MONTHLY;BYMONTHDAY=7',
      '2025-10-06T18:30:00.000Z',
      'Every month on the 7th',
    ],
    ['monthly', 'FREQ=MONTHLY;BYMONTHDAY=7', '2025-10-06T18:30:00.000Z', 'Every month on the 7th'],
    [
      'every month on the 15th',
      'FREQ=MONTHLY;BYMONTHDAY=15',
      '2025-10-14T18:30:00.000Z',
      'Every month on the 15th',
    ],
    [
      'every month on the 1st',
      'FREQ=MONTHLY;BYMONTHDAY=1',
      '2025-10-31T18:30:00.000Z',
      'Every month on the 1st',
    ],
    ['every year', 'FREQ=YEARLY', '2025-10-06T18:30:00.000Z', 'Every year'],
    ['yearly', 'FREQ=YEARLY', '2025-10-06T18:30:00.000Z', 'Every year'],
    ['annually', 'FREQ=YEARLY', '2025-10-06T18:30:00.000Z', 'Every year'],
  ])(
    'reads "%s" with no date as the first occurrence on or after today',
    (text, rule, dueAt, label) => {
      const result = parse(`Task ${text}`);
      expect(result).toMatchObject({
        title: 'Task',
        recurrenceRule: rule,
        dueAt,
        dueAllDay: true,
      });
      expect(result.parts).toEqual([
        expect.objectContaining({ kind: 'repeat', text, label, start: 5, end: 5 + text.length }),
      ]);
    },
  );

  it('does not read "every monday" as the date "monday"', () => {
    expect(parse('gym every monday').parts.map((part) => part.kind)).toEqual(['repeat']);
  });

  it('uses the typed date as the due date and takes the blanks from it', () => {
    const weekly = parse('water plants friday every week');
    expect(weekly).toMatchObject({
      title: 'water plants',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR',
      dueAt: '2025-10-09T18:30:00.000Z',
      dueAllDay: true,
    });
    const monthly = parse('rent oct 20 monthly');
    expect(monthly).toMatchObject({
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=20',
      dueAt: '2025-10-19T18:30:00.000Z',
    });
  });

  it('puts a time with no date on the first occurrence', () => {
    const result = parse('standup every monday at 9am');
    expect(result).toMatchObject({
      title: 'standup',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      dueAt: '2025-10-13T03:30:00.000Z',
      dueAllDay: false,
    });
    expect(result.parts.map((part) => part.kind)).toEqual(['repeat', 'date']);
    expect(result.parts[1]?.label).toBe('Mon, 13 Oct');
  });

  it('puts a daily time on today', () => {
    expect(parse('pills daily 9pm')).toMatchObject({ dueAt: '2025-10-07T15:30:00.000Z' });
  });

  it('skips months without the day for the 31st', () => {
    const now = new Date('2025-10-31T18:40:00.000Z'); // 1 Nov, 00:10 IST
    expect(parse('x every month on the 31st', now).dueAt).toBe('2025-12-30T18:30:00.000Z');
    const monthEnd = new Date('2025-01-31T06:30:00.000Z');
    expect(parse('x every month', monthEnd)).toMatchObject({
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=31',
      dueAt: '2025-01-30T18:30:00.000Z',
    });
  });

  it('finds the next Monday over a leap day', () => {
    const leap = new Date('2028-02-28T06:30:00.000Z'); // Monday 28 Feb 2028
    expect(parse('x every tuesday', leap).dueAt).toBe('2028-02-28T18:30:00.000Z'); // 29 Feb
  });

  it('does not read repeat lookalikes', () => {
    for (const input of ['every', 'every other day', 'dailyish', 'every monkey']) {
      expect(parse(input).recurrenceRule).toBeNull();
    }
  });
});

describe('combined input', () => {
  it('understands every part of "Pay rent every month on the 1st #home !high"', () => {
    const result = parse('Pay rent every month on the 1st #home !high');
    expect(result).toEqual({
      title: 'Pay rent',
      dueAt: '2025-10-31T18:30:00.000Z',
      dueAllDay: true,
      priority: 2,
      tagNames: ['home'],
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      parts: [
        expect.objectContaining({ kind: 'repeat', text: 'every month on the 1st' }),
        expect.objectContaining({ kind: 'tag', text: '#home' }),
        expect.objectContaining({ kind: 'priority', text: '!high' }),
      ],
    });
  });

  it('reads date, tag and priority together', () => {
    const result = parse('Call mum tomorrow 5pm #family !urgent');
    expect(result).toMatchObject({
      title: 'Call mum',
      dueAt: '2025-10-08T11:30:00.000Z',
      priority: 1,
      tagNames: ['family'],
    });
  });

  it('keeps positions in the original text', () => {
    const input = 'Call mum tomorrow 5pm #family !urgent';
    for (const part of parse(input).parts) {
      expect(input.slice(part.start, part.end)).toBe(part.text);
    }
    expect(parse(input).parts.map((part) => part.text)).toEqual([
      'tomorrow 5pm',
      '#family',
      '!urgent',
    ]);
  });

  it('does not join two words that a tag separates into one date', () => {
    const result = parse('tomorrow #x 5pm');
    expect(result.parts.map((part) => part.text)).toEqual(['tomorrow', '#x']);
  });
});

describe('ignored parts', () => {
  it('keeps an ignored tag, priority or date in the title and changes nothing', () => {
    const tag = parse('buy #home !high', NOW, ['tag:#home']);
    expect(tag).toMatchObject({ title: 'buy #home', tagNames: [], priority: 2 });
    const priority = parse('buy !high', NOW, [partKey({ kind: 'priority', text: '!high' })]);
    expect(priority).toMatchObject({ title: 'buy !high', priority: null, parts: [] });
    const date = parse('buy tomorrow', NOW, ['date:tomorrow']);
    expect(date).toMatchObject({ title: 'buy tomorrow', dueAt: null, parts: [] });
  });

  it('keeps an ignored repeat in the title without turning it into a date', () => {
    const result = parse('gym every monday', NOW, ['repeat:every monday']);
    expect(result).toMatchObject({ title: 'gym every monday', recurrenceRule: null, dueAt: null });
  });

  it('uses the first day of a repeat when only its date is ignored', () => {
    const result = parse('gym every monday at 9am', NOW, ['date:at 9am']);
    expect(result).toMatchObject({
      title: 'gym at 9am',
      dueAt: '2025-10-12T18:30:00.000Z',
      dueAllDay: true,
    });
  });

  it('gives the part key as kind and typed text', () => {
    expect(partKey({ kind: 'tag', text: '#home' })).toBe('tag:#home');
  });
});

describe('title', () => {
  it('can be empty when only parts were typed', () => {
    const result = parse('#home !1 tomorrow');
    expect(result.title).toBe('');
    expect(result.parts).toHaveLength(3);
  });

  it('collapses spaces and trims', () => {
    expect(parse('  buy   milk   #x   ').title).toBe('buy milk');
  });
});

describe('strange input', () => {
  it.each([
    ['empty', ''],
    ['spaces', '    '],
    ['emoji', '😀😀 #😀 !high 🎉 tomorrow'],
    ['only symbols', '#### !!! ??? @@@'],
    ['very long', 'word '.repeat(20000)],
    ['many tags', '#a '.repeat(5000)],
    ['half repeat', 'every every every month on the'],
  ])('never throws on %s', (_name, input) => {
    expect(() => parse(input)).not.toThrow();
    const result = parse(input);
    expect(typeof result.title).toBe('string');
    expect(Array.isArray(result.parts)).toBe(true);
  });

  it('returns an empty result for empty input', () => {
    expect(parse('')).toEqual({
      title: '',
      dueAt: null,
      dueAllDay: false,
      priority: null,
      tagNames: [],
      recurrenceRule: null,
      parts: [],
    });
  });
});
