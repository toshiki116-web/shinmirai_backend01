INSERT INTO admins (id, login_id, password, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'sinmirai-admin',
  '$2b$10$C4AwAQrYJ4HKQb9ZX2rXYekHJaajJId8x3jmsOv8r85ZvB38U3wGy',
  'システム管理者',
  NOW(), NOW()
)
ON CONFLICT (login_id) DO NOTHING;
