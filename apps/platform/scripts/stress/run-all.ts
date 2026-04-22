#!/usr/bin/env tsx
// Run all stress-test scenarios sequentially. Does NOT run cleanup — do that
// from /admin/system after.

import './01-double-post'
import './03-invite-probe'
import './04-self-referral'
import './05-garbage-inputs'
import './06-student-submit-unauth'
import './07-student-review-unauth'
