import { describe, expect, it } from 'vitest';
import { authGuidance, NO_PROJECT_MESSAGE } from '../src/errors.js';

describe('authGuidance', () => {
  it.each([
    'Run "suitecloud account:setup" to configure an account.',
    'The authentication ID (authid) "prod" does not exist.',
    'Error: The token has expired or been revoked.',
    'You are not authenticated. Please log in.',
  ])('detects auth problems in: %s', (output) => {
    expect(authGuidance(output)).toContain('suitecloud account:setup');
  });

  it('returns null for ordinary validation errors', () => {
    expect(authGuidance('Validation failed: Objects/customrecord_x.xml line 12: invalid field')).toBeNull();
  });
});

describe('NO_PROJECT_MESSAGE', () => {
  it('points the caller at setup_project', () => {
    expect(NO_PROJECT_MESSAGE).toContain('setup_project');
  });
});
