-- Custom SQL migration file, put your code below! --
CREATE INDEX ON files (artisan_id);
CREATE INDEX ON files (sha256);
CREATE INDEX ON files (purpose);
CREATE INDEX ON files (deleted_at) WHERE deleted_at IS NULL;