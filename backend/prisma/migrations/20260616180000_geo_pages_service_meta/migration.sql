-- GEO-TOPIC · 服务项目并入专题：流程/参考价等扩展元数据
ALTER TABLE `geo_pages`
  ADD COLUMN `service_meta_json` JSON NOT NULL DEFAULT ('{}');
