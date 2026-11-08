-- Google sign-in (OAuth 2.0 Authorization Code flow). Additive only: no existing table is changed.

-- Short-lived, single-use records for the OAuth round trip (state / nonce / PKCE verifier).
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,          -- SHA-256 of the random state value
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  next_path TEXT NOT NULL DEFAULT '/dashboard',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_oauth_states_exp ON oauth_states(expires_at);

-- Links a B-MART user to an external identity. (provider, subject) is globally unique:
-- one Google account can only ever belong to one user.
CREATE TABLE oauth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,                -- Google "sub" claim (stable account id, never the email)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX idx_oauth_identities_user ON oauth_identities(user_id);
