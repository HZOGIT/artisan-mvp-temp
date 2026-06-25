-- Custom SQL migration file, put your code below! --
CREATE INDEX idx_notifications_artisan_lu
  ON notifications ("artisanId", lu, archived)
  WHERE archived = false;