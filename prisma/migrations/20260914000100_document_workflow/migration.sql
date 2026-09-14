ALTER TABLE template_versions ADD COLUMN page_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_versions ADD CONSTRAINT template_versions_page_count_check CHECK (page_count BETWEEN 1 AND 20);
ALTER TABLE generations ADD COLUMN request_key UUID, ADD COLUMN request_hash TEXT, ADD COLUMN snapshot JSONB;
CREATE UNIQUE INDEX generations_created_by_id_request_key_key ON generations(created_by_id, request_key);

-- Active selection may change, but a version used by a generation is immutable.
CREATE FUNCTION protect_used_template_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM generations WHERE template_version_id = OLD.id)
     AND (to_jsonb(NEW) - 'is_active') IS DISTINCT FROM (to_jsonb(OLD) - 'is_active') THEN
    RAISE EXCEPTION 'A used template version cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_version_immutable BEFORE UPDATE ON template_versions
FOR EACH ROW EXECUTE FUNCTION protect_used_template_version();

CREATE FUNCTION protect_used_template_element() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN version_id := NEW.template_version_id; ELSE version_id := OLD.template_version_id; END IF;
  IF EXISTS (SELECT 1 FROM generations WHERE template_version_id = version_id)
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM generations WHERE template_version_id = NEW.template_version_id)) THEN
    RAISE EXCEPTION 'Elements of a used template version cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_element_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_elements
FOR EACH ROW EXECUTE FUNCTION protect_used_template_element();
