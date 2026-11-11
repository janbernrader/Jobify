import { describe, expect, it } from 'vitest';
import { sharedPosting } from './sharedPosting';

const shared = (query: string) => sharedPosting(new URLSearchParams(query));

describe('sharedPosting', () => {
  it('takes the link from url', () => {
    expect(shared('url=https://www.linkedin.com/jobs/view/4123456789')).toEqual({
      url: 'https://www.linkedin.com/jobs/view/4123456789',
      text: undefined,
      title: undefined,
    });
  });

  it('finds the link inside shared text, as iOS and Android apps send it', () => {
    const result = shared('text=Senior+Engineer+at+Acme%0Ahttps%3A%2F%2Fjobs.acme.test%2F42');
    expect(result?.url).toBe('https://jobs.acme.test/42');
    expect(result?.text).toBe('Senior Engineer at Acme\nhttps://jobs.acme.test/42');
  });

  it('does not keep text that is only the link repeated', () => {
    expect(shared('text=https%3A%2F%2Fjobs.acme.test%2F42')).toEqual({
      url: 'https://jobs.acme.test/42',
      text: undefined,
      title: undefined,
    });
  });

  it('keeps a shared posting with no link at all', () => {
    expect(shared('title=Backend+Engineer&text=We+are+hiring')).toEqual({
      url: undefined,
      text: 'We are hiring',
      title: 'Backend Engineer',
    });
  });

  it('stops the link at whitespace', () => {
    expect(shared('text=Look%3A+https%3A%2F%2Facme.test%2F42+-+closes+Friday')?.url).toBe(
      'https://acme.test/42',
    );
  });

  it('is nothing when the page was opened normally', () => {
    expect(shared('')).toBeUndefined();
    expect(shared('url=+&text=++')).toBeUndefined();
  });
});
