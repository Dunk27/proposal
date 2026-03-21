-- Атомарный инкремент счётчика использования
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_month TEXT)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  INSERT INTO usage (user_id, month, count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month) DO UPDATE
    SET count = usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
