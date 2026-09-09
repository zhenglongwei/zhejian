# Skill: UI 文案 · 受众口吻（商家 / 车主）

> Agent 入口：`.cursor/skills/ui-copy-audience/SKILL.md`  
> 红线规则：`.cursor/rules/ui-copy-not-prd.mdc` · 设计体系 §2.4.1

## 目标

写小程序可见文案时：先禁需求话术上屏，再按受众套口吻——**商家简练专业，车主简练专业且友好亲切**；禁止检测/内部作业标签原样给车主当主文案。

## 使用场景

- 改标题、副文、Toast、空态、单据行名与状态
- 商家与车主看到同一业务字段
- 用户要求「文案友好一点 / 专业一点 / 不要需处理」

## 必读

1. `.cursor/rules/ui-copy-not-prd.mdc`
2. `docs/00_设计规范/00_辙见平台设计体系.md` §2.4.1
3. `.cursor/skills/ui-copy-audience/SKILL.md`（步骤与对照表）

## 输出

- 直接给出拟上屏短文案（或「靠版式、不写提示」）
- 标明受众：商家 / 车主
- 若改双端：两套文案分列，说明是否共享存储字段

## 自检

见 `ui-copy-audience` skill 内清单；页面交付时由 `design-system-check` 复核 UX-COPY + 口吻项。
