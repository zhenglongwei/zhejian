-- CreateTable
CREATE TABLE `geo_check_target` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `industry` VARCHAR(40) NOT NULL DEFAULT '',
    `source` VARCHAR(16) NOT NULL DEFAULT 'SELF',
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `authorized` BOOLEAN NOT NULL DEFAULT false,
    `contact_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `geo_check_target_source_visible_idx`(`source`, `visible`),
    INDEX `geo_check_target_industry_city_idx`(`industry`, `city`),
    UNIQUE INDEX `geo_check_target_name_city_key`(`name`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `geo_check_run` (
    `id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(16) NOT NULL DEFAULT 'API',
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `config_json` JSON NOT NULL,
    `question_count` INTEGER NOT NULL DEFAULT 0,
    `answer_count` INTEGER NOT NULL DEFAULT 0,
    `error_count` INTEGER NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,

    INDEX `geo_check_run_target_id_started_at_idx`(`target_id`, `started_at`),
    INDEX `geo_check_run_channel_status_idx`(`channel`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `geo_check_answer` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(16) NOT NULL DEFAULT 'API',
    `platform` VARCHAR(32) NOT NULL,
    `platform_label` VARCHAR(64) NOT NULL DEFAULT '',
    `question` TEXT NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'ok',
    `error_message` VARCHAR(512) NOT NULL DEFAULT '',
    `answer_text` TEXT NOT NULL,
    `mentioned` BOOLEAN NULL,
    `mention_offset` INTEGER NOT NULL DEFAULT -1,
    `sentiment` VARCHAR(16) NOT NULL DEFAULT 'unknown',
    `cited_urls_json` JSON NOT NULL,
    `ecosystems_json` JSON NOT NULL,
    `screenshot_path` VARCHAR(255) NOT NULL DEFAULT '',
    `probed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `geo_check_answer_run_id_idx`(`run_id`),
    INDEX `geo_check_answer_target_id_platform_probed_at_idx`(`target_id`, `platform`, `probed_at`),
    INDEX `geo_check_answer_channel_status_idx`(`channel`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `geo_check_score` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(16) NOT NULL DEFAULT 'API',
    `score` INTEGER NOT NULL DEFAULT 0,
    `dimensions_json` JSON NOT NULL,
    `coverage_rate` INTEGER NOT NULL DEFAULT 0,
    `ecosystems_json` JSON NOT NULL,
    `valid_platforms` INTEGER NOT NULL DEFAULT 0,
    `planned_platforms` INTEGER NOT NULL DEFAULT 0,
    `confidence` INTEGER NOT NULL DEFAULT 0,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `geo_check_score_run_id_key`(`run_id`),
    INDEX `geo_check_score_target_id_computed_at_idx`(`target_id`, `computed_at`),
    INDEX `geo_check_score_channel_score_idx`(`channel`, `score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
