import { describe, expect, it } from 'vite-plus/test';
import { ApiError, isForbiddenError } from '../api-error';

describe('isForbiddenError', () => {
  it('recognises a request the API refused', () => {
    expect(
      isForbiddenError(
        new ApiError({
          status: 403,
          data: {
            title: 'Forbidden',
            status: 403,
            detail: 'missing required scope: read:customers',
            code: 'Auth.MissingScope',
          },
        }),
      ),
    ).toBe(true);
  });

  it('does not take a request without identity for a refused one', () => {
    expect(isForbiddenError(new ApiError({ status: 401, data: null }))).toBe(
      false,
    );
  });

  it('does not take a request that got no response for a refused one', () => {
    expect(
      isForbiddenError(
        new ApiError({ data: new TypeError('Failed to fetch') }),
      ),
    ).toBe(false);
  });

  // The status is read from the response the API gave, never guessed from the
  // text of an error.
  it('ignores an error that is not an ApiError', () => {
    expect(
      isForbiddenError(new Error('GraphQL request failed with status 403')),
    ).toBe(false);
    expect(isForbiddenError({ status: 403 })).toBe(false);
  });
});
