CREATE TRIGGER wallet_tx_no_update BEFORE UPDATE ON wallet_transactions BEGIN SELECT RAISE(ABORT, 'wallet_transactions is immutable'); END;
CREATE TRIGGER wallet_tx_no_delete BEFORE DELETE ON wallet_transactions BEGIN SELECT RAISE(ABORT, 'wallet_transactions is immutable'); END;
