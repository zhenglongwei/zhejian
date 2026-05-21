-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "service_name" TEXT NOT NULL DEFAULT '',
    "store_id" TEXT NOT NULL DEFAULT '',
    "store_name" TEXT NOT NULL DEFAULT '',
    "vehicle_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "template_id" TEXT NOT NULL DEFAULT '',
    "template_name" TEXT NOT NULL DEFAULT '',
    "store_note" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "public_case_status" TEXT NOT NULL DEFAULT 'private',
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "album_nodes" (
    "album_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "album_nodes_pkey" PRIMARY KEY ("album_id","node_id")
);

CREATE TABLE "album_images" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 0,
    "raw_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "desensitize_tasks" (
    "task_id" TEXT NOT NULL,
    "biz_type" TEXT NOT NULL,
    "biz_id" TEXT NOT NULL,
    "order_id" TEXT,
    "operator_role" TEXT NOT NULL,
    "liability_type" TEXT NOT NULL,
    "pre_mask_status" TEXT,
    "pre_mask_version" INTEGER NOT NULL DEFAULT 0,
    "pre_mask_task_id" TEXT,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "from_pre_mask" BOOLEAN NOT NULL DEFAULT false,
    "masking_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "masking_confirmed_at" TIMESTAMP(3),
    "pre_masked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desensitize_tasks_pkey" PRIMARY KEY ("task_id")
);

CREATE TABLE "desensitize_assets" (
    "task_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "node_title" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 0,
    "raw_url" TEXT NOT NULL,
    "masked_url" TEXT NOT NULL DEFAULT '',
    "pre_masked_url" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "previewed" BOOLEAN NOT NULL DEFAULT false,
    "risk_tags" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "desensitize_assets_pkey" PRIMARY KEY ("task_id","asset_id")
);

CREATE TABLE "album_authorizations" (
    "album_id" TEXT NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "album_authorizations_pkey" PRIMARY KEY ("album_id")
);

CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE UNIQUE INDEX "albums_order_id_key" ON "albums"("order_id");
CREATE INDEX "album_images_album_id_node_id_idx" ON "album_images"("album_id", "node_id");
CREATE INDEX "desensitize_tasks_biz_id_biz_type_idx" ON "desensitize_tasks"("biz_id", "biz_type");

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "albums" ADD CONSTRAINT "albums_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "album_nodes" ADD CONSTRAINT "album_nodes_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_images" ADD CONSTRAINT "album_images_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_images" ADD CONSTRAINT "album_images_album_id_node_id_fkey" FOREIGN KEY ("album_id", "node_id") REFERENCES "album_nodes"("album_id", "node_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "desensitize_assets" ADD CONSTRAINT "desensitize_assets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "desensitize_tasks"("task_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_authorizations" ADD CONSTRAINT "album_authorizations_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
