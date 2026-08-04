import assert from 'node:assert/strict';
import test from 'node:test';

import {formatLogContent} from './SharedLogsTable';

test('preserves plain-text log content longer than 200 characters', () => {
	const content = 'A'.repeat(250);

	assert.equal(formatLogContent(content, undefined), content);
});
